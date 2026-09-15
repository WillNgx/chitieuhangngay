import { Composer } from 'grammy';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { logger } from '../../shared/logger/index.js';
import { aiService } from '../../modules/ai/ai.service.js';
import { transactionService } from '../../modules/transaction/transaction.service.js';
import { authService } from '../../modules/auth/auth.service.js';
import { receiptService } from '../../modules/receipt/receipt.service.js';
import { downloadTelegramFile } from '../utils/file-downloader.js';
import { messageBufferManager, ChatBuffer } from '../message-buffer.js';
import { createTransactionPreviewKeyboard } from '../keyboards/transaction.keyboard.js';
import { formatTransactionPreview } from '../utils/preview-formatter.js';
import { waitingForEditState } from './callback.handler.js';
import { bot } from '../bot.js';

import { ExpenseParserOutput, ReceiptExtractorOutput } from '../../modules/ai/ai.types.js';
import { CreateTransactionInput } from '../../modules/transaction/transaction.types.js';

export const textComposer = new Composer();

/**
 * Xử lý khi buffer chốt giao dịch (hỗ trợ cả text và ảnh hoá đơn)
 */
export async function handleBufferFlush(buffer: ChatBuffer) {
  const { chatId, userId, texts, photos } = buffer;

  // Lấy User DB record
  const dbUser = await authService.getUserByTelegramId(userId);
  if (!dbUser) {
    await bot.api.sendMessage(chatId, '⚠️ Lỗi: Không tìm thấy thông tin tài khoản người dùng.');
    return;
  }

  const combinedText = texts.join('. ');

  let createdTransactionId: string | null = null;
  try {
    let parsed: ExpenseParserOutput | ReceiptExtractorOutput;
    let source: 'text' | 'receipt' = 'text';
    let downloadedBuffer: Buffer | null = null;
    let compressedBuffer: Buffer | null = null;
    let receiptFileId: string | null = null;

    if (photos.length > 0) {
      source = 'receipt';
      receiptFileId = photos[0].fileId;
      downloadedBuffer = await downloadTelegramFile(receiptFileId);
      compressedBuffer = (await receiptService.compressImage(downloadedBuffer)).compressedBuffer;
      parsed = await aiService.extractReceipt(compressedBuffer, 'image/jpeg', combinedText);
    } else {
      parsed = await aiService.parseExpenseText(combinedText);
    }

    // Tạo pending transaction và tính toán Decimal USD
    const tx = await transactionService.createPendingTransaction({
      userId: dbUser.id,
      amount: new Prisma.Decimal(parsed.amount),
      currency: parsed.currency,
      categoryName: parsed.category,
      subcategoryName: parsed.subcategory,
      merchant: parsed.merchant,
      description: parsed.description || combinedText,
      purpose: parsed.purpose,
      aiConfidence: parsed.confidence,
      source,
      transactionAt: buffer.startedAt,
    });
    createdTransactionId = tx.id;

    // Nếu có ảnh hoá đơn, nén và lưu trữ với hạn 2 tháng
    if (downloadedBuffer && receiptFileId) {
      const ocrText = 'rawOcrText' in parsed ? parsed.rawOcrText : undefined;
      await receiptService.saveReceipt({
        telegramFileId: receiptFileId,
        imageBuffer: compressedBuffer || downloadedBuffer,
        transactionId: tx.id,
        ocrData: ocrText ? { text: ocrText } : undefined,
      });
    }

    await prisma.aiExtraction
      .create({
        data: {
          transactionId: tx.id,
          model: 'gemini',
          rawInput:
            source === 'receipt' ? combinedText || receiptFileId || '[receipt]' : combinedText,
          extractedJson: parsed as unknown as Prisma.InputJsonValue,
          confidence: new Prisma.Decimal(parsed.confidence),
        },
      })
      .catch((error) => logger.warn({ error, transactionId: tx.id }, 'Không thể lưu AI audit record'));

    // Gửi tin nhắn Preview bắt buộc kèm bàn phím Inline
    const previewText = formatTransactionPreview(tx);
    await bot.api.sendMessage(chatId, previewText, {
      reply_markup: createTransactionPreviewKeyboard(tx.id),
    });
  } catch (error) {
    if (createdTransactionId) {
      await transactionService.deletePendingTransaction(createdTransactionId).catch(() => undefined);
    }
    logger.error({ error, combinedText }, 'Lỗi khi xử lý tin nhắn chi tiêu từ buffer');
    const msg = error instanceof Error ? error.message : 'Đã có lỗi xảy ra khi phân tích chi tiêu.';
    await bot.api.sendMessage(chatId, `⚠️ ${msg}`);
  }
}

textComposer.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Bỏ qua các command bắt đầu bằng /
  if (text.startsWith('/')) {
    return;
  }

  const chatId = ctx.chat.id;
  const userId = ctx.from.id.toString();

  // 1. Kiểm tra xem người dùng có đang trong trạng thái sửa một trường cụ thể không
  const editStateKey = `${chatId}:${userId}`;
  const editState = waitingForEditState.get(editStateKey);

  if (editState) {
    waitingForEditState.delete(editStateKey);
    try {
      const updates: Partial<CreateTransactionInput> = {};
      if (editState.field === 'amount') {
        const parts = text.split(' ');
        const numPart = parts[0].replace(/[^0-9.]/g, '');
        updates.amount = new Prisma.Decimal(numPart);
        if (parts[1]) {
          updates.currency = parts[1].toUpperCase();
        }
      } else if (editState.field === 'category') {
        updates.categoryName = text;
      } else if (editState.field === 'merchant') {
        updates.merchant = text;
      } else if (editState.field === 'purpose') {
        updates.purpose = text;
      }

      const updatedTx = await transactionService.updateTransaction(
        editState.transactionId,
        updates,
      );
      await ctx.reply(`✏️ Đã cập nhật thành công!\n\n${formatTransactionPreview(updatedTx)}`, {
        reply_markup: createTransactionPreviewKeyboard(updatedTx.id),
      });
    } catch (err) {
      logger.error({ err }, 'Lỗi khi cập nhật giao dịch');
      await ctx.reply('⚠️ Không thể cập nhật giao dịch. Vui lòng thử lại.');
    }
    return;
  }

  // 2. Nếu là tin nhắn chi tiêu bình thường, đưa vào buffer gom nhóm 3 phút
  logger.info({ chatId, userId, text }, 'Nhận tin nhắn chi tiêu, thêm vào buffer');
  await messageBufferManager.addText(chatId, userId, text, handleBufferFlush);
});
