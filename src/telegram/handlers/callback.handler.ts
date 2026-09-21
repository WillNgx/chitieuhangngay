import { Composer } from 'grammy';
import { transactionService } from '../../modules/transaction/transaction.service.js';
import { logger } from '../../shared/logger/index.js';
import {
  createTransactionPreviewKeyboard,
  createEditFieldKeyboard,
} from '../keyboards/transaction.keyboard.js';
import { formatBatchPreview, formatTransactionPreview } from '../utils/preview-formatter.js';
import { messageBufferManager } from '../message-buffer.js';
import { processReceiptBuffer } from '../expense-processor.js';
import { previewRegistry } from '../preview-registry.js';

export const callbackComposer = new Composer();

// Lưu trạng thái đang đợi user nhập giá trị sửa: `${chatId}:${userId}` -> { transactionId, field }
export const waitingForEditState = new Map<string, { transactionId: string; field: string }>();

callbackComposer.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id;
  const userId = ctx.from.id.toString();

  try {
    // Ảnh hoá đơn đang chờ ghi chú: xử lý ngay không cần đợi 2 phút
    if (data.startsWith('buffer_flush:')) {
      const bufferId = data.replace('buffer_flush:', '');
      const flushed =
        chatId !== undefined &&
        messageBufferManager.flushById(chatId, bufferId, processReceiptBuffer);

      await ctx.answerCallbackQuery({
        text: flushed ? '⚡ Đang xử lý ảnh hoá đơn...' : 'Ảnh này đã được xử lý rồi',
      });
      // Gỡ nút để không bấm lại được
      await ctx
        .editMessageText(flushed ? '🧾 Đang xử lý ảnh hoá đơn...' : '🧾 Ảnh hoá đơn đã được xử lý.')
        .catch(() => undefined);
      return;
    }

    // Tin nhắn nhiều khoản: xác nhận / huỷ cả nhóm
    if (data.startsWith('batch_confirm:')) {
      const txs = await transactionService.confirmBatch(data.replace('batch_confirm:', ''));
      previewRegistry.forget(txs.map((tx) => tx.id));

      await ctx.answerCallbackQuery({ text: `✅ Đã ghi nhận ${txs.length} khoản chi!` });
      await ctx.editMessageText(
        `✅ ĐÃ XÁC NHẬN ${txs.length} KHOẢN CHI\n\n${formatBatchPreview(txs)}`,
      );
      return;
    }

    if (data.startsWith('batch_cancel:')) {
      const txs = await transactionService.rejectBatch(data.replace('batch_cancel:', ''));
      previewRegistry.forget(txs.map((tx) => tx.id));

      await ctx.answerCallbackQuery({ text: `❌ Đã huỷ ${txs.length} khoản chi!` });
      await ctx.editMessageText(`❌ ĐÃ HUỶ ${txs.length} KHOẢN CHI\n\n${formatBatchPreview(txs)}`);
      return;
    }

    // 1. Xác nhận giao dịch
    if (data.startsWith('tx_confirm:')) {
      const transactionId = data.replace('tx_confirm:', '');
      const tx = await transactionService.confirmTransaction(transactionId);
      previewRegistry.forget([transactionId]);

      await ctx.answerCallbackQuery({ text: '✅ Đã ghi nhận chi tiêu!' });
      await ctx.editMessageText(
        `✅ **GIAO DỊCH ĐÃ ĐƯỢC XÁC NHẬN**\n\n${formatTransactionPreview(tx)}`,
        {
          parse_mode: 'Markdown',
        },
      );
      return;
    }

    // 2. Huỷ giao dịch
    if (data.startsWith('tx_cancel:')) {
      const transactionId = data.replace('tx_cancel:', '');
      const tx = await transactionService.rejectTransaction(transactionId);
      previewRegistry.forget([transactionId]);

      await ctx.answerCallbackQuery({ text: '❌ Đã huỷ giao dịch!' });
      await ctx.editMessageText(`❌ ~~GIAO DỊCH ĐÃ BỊ HUỶ~~\n\n${formatTransactionPreview(tx)}`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    // 3. Mở menu Sửa
    if (data.startsWith('tx_edit:')) {
      const transactionId = data.replace('tx_edit:', '');
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({
        reply_markup: createEditFieldKeyboard(transactionId),
      });
      return;
    }

    // 4. Chọn field cần sửa
    if (data.startsWith('edit_field:')) {
      const [, transactionId, field] = data.split(':');

      if (field === 'back') {
        await ctx.answerCallbackQuery();
        await ctx.editMessageReplyMarkup({
          reply_markup: createTransactionPreviewKeyboard(transactionId),
        });
        return;
      }

      if (chatId) {
        waitingForEditState.set(`${chatId}:${userId}`, { transactionId, field });
      }

      const fieldNames: Record<string, string> = {
        amount: 'số tiền (vd: 350 hoặc 150000 VND)',
        category: 'danh mục mới (vd: Food hoặc Grab)',
        merchant: 'tên cửa hàng/đơn vị (vd: 7-Eleven, Starbucks)',
        purpose: 'mục đích chi tiêu (vd: Ăn sáng)',
      };

      await ctx.answerCallbackQuery();
      await ctx.reply(`✏️ Vui lòng gửi tin nhắn chứa ${fieldNames[field] || field} mới:`);
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    logger.error({ error, data }, 'Lỗi xử lý callback query');
    await ctx.answerCallbackQuery({ text: '⚠️ Đã xảy ra lỗi khi xử lý thao tác.' });
  }
});
