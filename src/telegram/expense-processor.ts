import { Prisma } from '@prisma/client';
import { prisma } from '../infrastructure/database/prisma.js';
import { logger } from '../shared/logger/index.js';
import { aiService } from '../modules/ai/ai.service.js';
import { transactionService } from '../modules/transaction/transaction.service.js';
import { authService } from '../modules/auth/auth.service.js';
import { receiptService } from '../modules/receipt/receipt.service.js';
import { ExpenseItem, ReceiptExtractorOutput } from '../modules/ai/ai.types.js';
import { downloadTelegramFile } from './utils/file-downloader.js';
import { ChatBuffer } from './message-buffer.js';
import {
  createBatchPreviewKeyboard,
  createTransactionPreviewKeyboard,
} from './keyboards/transaction.keyboard.js';
import { formatBatchPreview, formatTransactionPreview } from './utils/preview-formatter.js';
import { bot } from './bot.js';

// Giới hạn số khoản trong 1 tin nhắn để tránh tốn quota AI và tin xem trước quá dài
export const MAX_EXPENSES_PER_MESSAGE = 20;

type PendingTransaction = Awaited<ReturnType<typeof transactionService.createPendingTransaction>>;

/**
 * Tạo 1 giao dịch pending_confirm từ output AI (đã qua Zod) + lưu bản ghi audit AI
 */
async function createPendingTransactionWithAudit(
  dbUserId: string,
  item: ExpenseItem | ReceiptExtractorOutput,
  source: 'text' | 'receipt',
  transactionAt: Date,
  rawInput: string,
): Promise<PendingTransaction> {
  const tx = await transactionService.createPendingTransaction({
    userId: dbUserId,
    amount: new Prisma.Decimal(item.amount),
    currency: item.currency,
    categoryName: item.category,
    subcategoryName: item.subcategory,
    merchant: item.merchant,
    description: item.description || rawInput,
    purpose: item.purpose,
    aiConfidence: item.confidence,
    source,
    transactionAt,
  });

  await prisma.aiExtraction
    .create({
      data: {
        transactionId: tx.id,
        model: 'gemini',
        rawInput,
        extractedJson: item as unknown as Prisma.InputJsonValue,
        confidence: new Prisma.Decimal(item.confidence),
      },
    })
    .catch((error) =>
      logger.warn({ error, transactionId: tx.id }, 'Không thể lưu AI audit record'),
    );

  return tx;
}

// Lỗi giữa chừng -> xoá các giao dịch pending đã tạo để không để lại nhóm lẻ
async function discardPendingTransactions(txs: PendingTransaction[]) {
  await Promise.all(
    txs.map((tx) => transactionService.deletePendingTransaction(tx.id).catch(() => undefined)),
  );
}

async function replyProcessingError(chatId: number, error: unknown, context: object) {
  logger.error({ error, ...context }, 'Lỗi khi xử lý tin nhắn chi tiêu');
  const msg = error instanceof Error ? error.message : 'Đã có lỗi xảy ra khi phân tích chi tiêu.';
  await bot.api.sendMessage(chatId, `⚠️ ${msg}`);
}

// Hiện "đang gõ..." trong lúc chờ AI, lỗi ở đây không ảnh hưởng luồng chính
function showTyping(chatId: number) {
  bot.api.sendChatAction(chatId, 'typing').catch(() => undefined);
}

function formatSkippedNotes(ignored: string[], invalidCount: number, truncatedCount: number) {
  const notes: string[] = [];
  if (ignored.length > 0) {
    notes.push(`⚠️ Bỏ qua (không nhận ra khoản chi): ${ignored.map((l) => `"${l}"`).join(', ')}`);
  }
  if (invalidCount > 0) {
    notes.push(`⚠️ ${invalidCount} khoản không đọc được, vui lòng gửi lại riêng.`);
  }
  if (truncatedCount > 0) {
    notes.push(
      `⚠️ Chỉ ghi nhận ${MAX_EXPENSES_PER_MESSAGE} khoản đầu, bỏ qua ${truncatedCount} khoản sau.`,
    );
  }
  return notes.length > 0 ? `\n\n${notes.join('\n')}` : '';
}

/**
 * Xử lý tin nhắn text chi tiêu ngay khi nhận: 1 tin có thể gồm nhiều khoản (mỗi dòng 1 khoản),
 * chỉ gọi AI 1 lần cho cả tin.
 */
export async function processExpenseText(
  chatId: number,
  telegramUserId: string,
  text: string,
  receivedAt: Date,
): Promise<void> {
  const dbUser = await authService.getUserByTelegramId(telegramUserId);
  if (!dbUser) {
    await bot.api.sendMessage(chatId, '⚠️ Lỗi: Không tìm thấy thông tin tài khoản người dùng.');
    return;
  }

  const lineCount = text.split('\n').filter((line) => line.trim()).length;
  if (lineCount > MAX_EXPENSES_PER_MESSAGE) {
    await bot.api.sendMessage(
      chatId,
      `⚠️ Mỗi tin nhắn tối đa ${MAX_EXPENSES_PER_MESSAGE} khoản chi (tin này có ${lineCount} dòng). Vui lòng tách thành nhiều tin.`,
    );
    return;
  }

  showTyping(chatId);
  const created: PendingTransaction[] = [];
  try {
    const parsed = await aiService.parseExpenseText(text);
    const items = parsed.expenses.slice(0, MAX_EXPENSES_PER_MESSAGE);

    // Tạo tuần tự để các khoản cùng danh mục mới không tạo trùng category.
    // Mọi khoản dùng chung transactionAt = thời điểm nhận tin -> dùng để nhận diện nhóm khi xác nhận.
    for (const item of items) {
      created.push(
        await createPendingTransactionWithAudit(dbUser.id, item, 'text', receivedAt, text),
      );
    }

    const notes = formatSkippedNotes(
      parsed.ignored,
      parsed.invalidCount,
      parsed.expenses.length - items.length,
    );

    if (created.length === 1) {
      await bot.api.sendMessage(chatId, `${formatTransactionPreview(created[0])}${notes}`, {
        reply_markup: createTransactionPreviewKeyboard(created[0].id),
      });
    } else {
      await bot.api.sendMessage(chatId, `${formatBatchPreview(created)}${notes}`, {
        reply_markup: createBatchPreviewKeyboard(created[0].id),
      });
    }
  } catch (error) {
    await discardPendingTransactions(created);
    await replyProcessingError(chatId, error, { text });
  }
}

/**
 * Xử lý lượt gom ảnh hoá đơn (ảnh + ghi chú nếu có) khi bấm "⚡ Xử lý ngay",
 * khi có ghi chú, hoặc khi hết 2 phút chờ.
 */
export async function processReceiptBuffer(buffer: ChatBuffer): Promise<void> {
  const { chatId, userId, texts, photos } = buffer;
  if (photos.length === 0) {
    return;
  }

  const dbUser = await authService.getUserByTelegramId(userId);
  if (!dbUser) {
    await bot.api.sendMessage(chatId, '⚠️ Lỗi: Không tìm thấy thông tin tài khoản người dùng.');
    return;
  }

  const note = texts.join('. ');
  showTyping(chatId);
  const created: PendingTransaction[] = [];
  try {
    const receiptFileId = photos[0].fileId;
    const downloadedBuffer = await downloadTelegramFile(receiptFileId);
    const { compressedBuffer } = await receiptService.compressImage(downloadedBuffer);
    const parsed = await aiService.extractReceipt(compressedBuffer, 'image/jpeg', note);

    const tx = await createPendingTransactionWithAudit(
      dbUser.id,
      parsed,
      'receipt',
      buffer.startedAt,
      note || receiptFileId,
    );
    created.push(tx);

    // Lưu ảnh hoá đơn với hạn 2 tháng
    await receiptService.saveReceipt({
      telegramFileId: receiptFileId,
      imageBuffer: compressedBuffer,
      transactionId: tx.id,
      ocrData: parsed.rawOcrText ? { text: parsed.rawOcrText } : undefined,
    });

    await bot.api.sendMessage(chatId, formatTransactionPreview(tx), {
      reply_markup: createTransactionPreviewKeyboard(tx.id),
    });
  } catch (error) {
    await discardPendingTransactions(created);
    await replyProcessingError(chatId, error, { note, source: 'receipt' });
  }
}
