import { ofetch } from 'ofetch';
import { bot } from '../bot.js';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';

export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  try {
    const file = await bot.api.getFile(fileId);
    if (!file.file_path) {
      throw new Error('Telegram không trả về file_path');
    }

    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const arrayBuffer = await ofetch(fileUrl, { responseType: 'arrayBuffer' });

    return Buffer.from(arrayBuffer);
  } catch (error) {
    logger.error({ error, fileId }, 'Lỗi khi tải file từ Telegram server');
    throw error;
  }
}
