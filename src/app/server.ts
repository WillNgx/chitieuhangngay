import fastify from 'fastify';
import { logger } from '../shared/logger/index.js';
import { env } from './config.js';
import { getTelegramWebhookHandler } from '../telegram/bot.js';

export function buildServer() {
  const server = fastify({
    loggerInstance: logger,
  });

  // Health check endpoint
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    };
  });

  // Telegram webhook endpoint
  const webhookHandler = getTelegramWebhookHandler();
  server.post('/telegram/webhook', async (req, reply) => {
    return webhookHandler(req, reply);
  });

  return server;
}

export async function startServer() {
  const server = buildServer();

  try {
    await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    logger.info(`🚀 Server running at http://${env.HOST}:${env.PORT}`);
    return server;
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}
