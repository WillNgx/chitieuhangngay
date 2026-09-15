import { Composer } from 'grammy';
import { logger } from '../../shared/logger/index.js';
import { messageBufferManager } from '../message-buffer.js';
import { handleBufferFlush } from './text.handler.js';

export const photoComposer = new Composer();

photoComposer.on('message:photo', async (ctx) => {
  const photos = ctx.message.photo;
  const caption = ctx.message.caption?.trim();
  const chatId = ctx.chat.id;
  const userId = ctx.from.id.toString();

  // Lấy ảnh có độ phân giải cao nhất (phần tử cuối mảng)
  const largestPhoto = photos[photos.length - 1];
  const fileId = largestPhoto?.file_id;

  if (!fileId) {
    await ctx.reply('⚠️ Không tìm thấy tệp ảnh hợp lệ.');
    return;
  }

  logger.info({ chatId, userId, fileId, caption }, 'Nhận ảnh hoá đơn, thêm vào buffer 3 phút');

  // Thêm vào message buffer
  await messageBufferManager.addPhoto(chatId, userId, { fileId, caption }, handleBufferFlush);

  await ctx.reply(
    '🧾 Đã nhận ảnh hoá đơn! Đang xử lý (bạn có thể gửi thêm ghi chú văn bản trong vòng 3 phút)...',
  );
});
