import { Composer } from 'grammy';
import { Prisma } from '@prisma/client';
import { logger } from '../../shared/logger/index.js';
import { transactionService } from '../../modules/transaction/transaction.service.js';
import { messageBufferManager } from '../message-buffer.js';
import { processExpenseText, processReceiptBuffer } from '../expense-processor.js';
import { createTransactionPreviewKeyboard } from '../keyboards/transaction.keyboard.js';
import { formatTransactionPreview } from '../utils/preview-formatter.js';
import { previewRegistry } from '../preview-registry.js';
import { AUTO_CONFIRM_HINT } from '../auto-confirm.job.js';
import { waitingForEditState } from './callback.handler.js';

import { CreateTransactionInput } from '../../modules/transaction/transaction.types.js';

export const textComposer = new Composer();

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
      // Chỉ giao dịch còn chờ xác nhận mới hiện lại nút [Xác nhận/Sửa/Huỷ]
      // (sửa xong thì đồng hồ tự xác nhận 5 phút tính lại từ đầu)
      const isPending = updatedTx.status === 'pending_confirm';
      const reply = await ctx.reply(
        `✏️ Đã cập nhật thành công!\n\n${formatTransactionPreview(updatedTx)}${isPending ? `\n\n${AUTO_CONFIRM_HINT}` : ''}`,
        {
          reply_markup: isPending ? createTransactionPreviewKeyboard(updatedTx.id) : undefined,
        },
      );
      if (isPending) {
        previewRegistry.register([updatedTx.id], { chatId, messageId: reply.message_id });
      }
    } catch (err) {
      logger.error({ err }, 'Lỗi khi cập nhật giao dịch');
      await ctx.reply('⚠️ Không thể cập nhật giao dịch. Vui lòng thử lại.');
    }
    return;
  }

  // 2. Đang có ảnh hoá đơn chờ ghi chú -> tin text này là ghi chú của ảnh, xử lý ảnh ngay
  if (messageBufferManager.attachNoteAndFlush(chatId, text, processReceiptBuffer)) {
    logger.info({ chatId, userId }, 'Nhận ghi chú cho ảnh hoá đơn đang chờ -> Xử lý ngay');
    return;
  }

  // 3. Tin nhắn chi tiêu (1 hoặc nhiều dòng): xử lý ngay, chạy nền để webhook trả về tức thì
  logger.info({ chatId, userId, text }, 'Nhận tin nhắn chi tiêu, xử lý ngay');
  void processExpenseText(chatId, userId, text, new Date()).catch((err) =>
    logger.error({ err, chatId }, 'Lỗi không mong muốn khi xử lý tin nhắn chi tiêu'),
  );
});
