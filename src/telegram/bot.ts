import { Bot, webhookCallback } from 'grammy';
import { env } from '../app/config.js';
import { logger } from '../shared/logger/index.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { commandComposer } from './handlers/command.handler.js';
import { photoComposer } from './handlers/photo.handler.js';
import { textComposer } from './handlers/text.handler.js';
import { callbackComposer } from './handlers/callback.handler.js';

import { idempotencyMiddleware } from './middlewares/idempotency.middleware.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Global Error Handler
bot.catch((err) => {
  const ctx = err.ctx;
  logger.error(
    { err: err.error, updateId: ctx.update.update_id },
    'Lỗi xử lý update trong Telegram Bot',
  );
});

// Middleware chống duplicate update khi Telegram retry
bot.use(idempotencyMiddleware);

// Middleware xác thực quyền truy cập qua password-gate
bot.use(authMiddleware);

// Handlers
bot.use(commandComposer);
bot.use(callbackComposer);
bot.use(photoComposer);
bot.use(textComposer);

/**
 * Trả về handler webhook tương thích Fastify
 */
export function getTelegramWebhookHandler() {
  return webhookCallback(bot, 'fastify', {
    secretToken: env.TELEGRAM_WEBHOOK_SECRET,
  });
}
