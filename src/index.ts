import { startServer } from './app/server.js';
import { env } from './app/config.js';
import { resolveKeepAliveUrl, startKeepAlive } from './app/keep-alive.js';
import { runReceiptCleanup } from './modules/receipt/receipt-cleanup.job.js';
import { runAutoConfirm } from './telegram/auto-confirm.job.js';
import { logger } from './shared/logger/index.js';

async function main() {
  logger.info('Initializing Telegram Expense Tracker Bot application...');

  // Khởi chạy Fastify server
  await startServer();

  // Chạy job dọn dẹp hoá đơn quá 2 tháng lần đầu khi khởi động
  runReceiptCleanup().catch((err) => {
    logger.warn({ err }, 'Không thể chạy cleanup job lúc khởi động');
  });

  // Lên lịch chạy job dọn dẹp hoá đơn định kỳ mỗi 24 giờ
  const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    runReceiptCleanup().catch((err) => {
      logger.warn({ err }, 'Lỗi khi chạy scheduled cleanup job');
    });
  }, CLEANUP_INTERVAL_MS);

  // Quét mỗi 30 giây: giao dịch chờ xác nhận quá 5 phút -> tự động xác nhận
  const AUTO_CONFIRM_SCAN_INTERVAL_MS = 30 * 1000;
  setInterval(() => {
    runAutoConfirm().catch((err) => {
      logger.warn({ err }, 'Lỗi khi chạy job tự động xác nhận');
    });
  }, AUTO_CONFIRM_SCAN_INTERVAL_MS);

  // Tự ping mỗi 14 phút để Render free không cho server ngủ (chỉ bật trên production)
  if (env.NODE_ENV === 'production') {
    const keepAliveUrl = resolveKeepAliveUrl({
      renderExternalUrl: env.RENDER_EXTERNAL_URL,
      telegramWebhookUrl: env.TELEGRAM_WEBHOOK_URL,
    });
    if (keepAliveUrl) {
      startKeepAlive(keepAliveUrl);
    } else {
      logger.warn('Không xác định được URL công khai -> không bật keep-alive');
    }
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error on bootstrap');
  process.exit(1);
});
