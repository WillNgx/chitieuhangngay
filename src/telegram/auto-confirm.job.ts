import { transactionService } from '../modules/transaction/transaction.service.js';
import { logger } from '../shared/logger/index.js';
import { formatBatchPreview, formatTransactionPreview } from './utils/preview-formatter.js';
import { previewRegistry } from './preview-registry.js';
import { bot } from './bot.js';

// Không bấm Xác nhận/Sửa/Huỷ trong 5 phút -> tự động xác nhận
export const AUTO_CONFIRM_AFTER_MS = 5 * 60 * 1000;

export const AUTO_CONFIRM_HINT = '⏳ Không bấm gì thì bot tự xác nhận sau 5 phút.';

let running = false;

/**
 * Job chạy định kỳ: xác nhận các giao dịch chờ quá 5 phút rồi cập nhật tin xem trước
 */
export async function runAutoConfirm(): Promise<void> {
  // Tránh 2 lượt chạy chồng nhau khi DB phản hồi chậm
  if (running) return;
  running = true;

  try {
    const groups = await transactionService.autoConfirmExpired(
      new Date(Date.now() - AUTO_CONFIRM_AFTER_MS),
    );

    for (const txs of groups) {
      const text =
        txs.length === 1
          ? `✅ ĐÃ TỰ ĐỘNG XÁC NHẬN (sau 5 phút)\n\n${formatTransactionPreview(txs[0])}`
          : `✅ ĐÃ TỰ ĐỘNG XÁC NHẬN ${txs.length} KHOẢN CHI (sau 5 phút)\n\n${formatBatchPreview(txs)}`;

      const location = previewRegistry.take(txs.map((tx) => tx.id));
      try {
        if (location) {
          // Sửa đúng tin xem trước, không kèm reply_markup -> gỡ các nút cũ
          await bot.api.editMessageText(location.chatId, location.messageId, text);
        } else {
          // Server vừa khởi động lại nên không còn vị trí tin xem trước -> báo bằng tin mới
          await bot.api.sendMessage(Number(txs[0].user.telegramId), text);
        }
      } catch (err) {
        logger.warn(
          { err, transactionIds: txs.map((tx) => tx.id) },
          'Không thể báo tự động xác nhận lên Telegram',
        );
      }
    }
  } finally {
    running = false;
  }
}
