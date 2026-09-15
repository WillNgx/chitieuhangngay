import { startServer } from './app/server.js';
import { runReceiptCleanup } from './modules/receipt/receipt-cleanup.job.js';
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
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error on bootstrap');
  process.exit(1);
});
