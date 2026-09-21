import { ofetch } from 'ofetch';
import { logger } from '../shared/logger/index.js';

// Render free ngủ sau 15 phút không có request vào -> tự ping trước mốc đó
export const KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000;

/**
 * URL health-check công khai của chính server: ưu tiên RENDER_EXTERNAL_URL (Render tự cấp),
 * sau đó tới domain của TELEGRAM_WEBHOOK_URL. Trả về null nếu không xác định được.
 */
export function resolveKeepAliveUrl(options: {
  renderExternalUrl?: string;
  telegramWebhookUrl?: string;
}): string | null {
  const baseUrl = options.renderExternalUrl || options.telegramWebhookUrl;
  if (!baseUrl) return null;
  try {
    return `${new URL(baseUrl).origin}/health`;
  } catch {
    return null;
  }
}

/**
 * Ping /health qua URL công khai mỗi 14 phút. Request đi vòng qua Render nên được tính là
 * traffic vào, giữ service không bị ngủ (tránh chờ khởi động lại vài chục giây).
 */
export function startKeepAlive(url: string): NodeJS.Timeout {
  logger.info({ url, intervalMinutes: KEEP_ALIVE_INTERVAL_MS / 60000 }, 'Bật keep-alive');
  return setInterval(() => {
    ofetch(url, { timeout: 30000 })
      .then(() => logger.debug({ url }, 'Keep-alive ping thành công'))
      .catch((err) => logger.warn({ err, url }, 'Keep-alive ping thất bại'));
  }, KEEP_ALIVE_INTERVAL_MS);
}
