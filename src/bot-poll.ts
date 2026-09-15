import { bot } from './telegram/bot.js';
import { logger } from './shared/logger/index.js';

async function startPolling() {
  logger.info('Đang kiểm tra và khởi động Bot ở chế độ Polling (cho môi trường local/test)...');

  // Xoá webhook cũ nếu có để cho phép polling
  await bot.api.deleteWebhook();

  logger.info('🚀 Bot đã sẵn sàng nhận tin nhắn qua Polling!');
  logger.info('👉 Hãy mở Telegram và nhắn tin cho bot để kiểm tra.');

  await bot.start({
    onStart: (botInfo) => {
      logger.info({ botInfo }, `Bot @${botInfo.username} đã hoạt động!`);
    },
  });
}

startPolling().catch((err) => {
  logger.error({ err }, 'Lỗi khi khởi động Polling');
  process.exit(1);
});
