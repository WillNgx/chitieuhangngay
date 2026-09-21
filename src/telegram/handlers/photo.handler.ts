import { Composer } from 'grammy';
import { logger } from '../../shared/logger/index.js';
import { messageBufferManager } from '../message-buffer.js';
import { processReceiptBuffer } from '../expense-processor.js';
import { createProcessNowKeyboard } from '../keyboards/transaction.keyboard.js';

export const photoComposer = new Composer();

photoComposer.on('message:photo', async (ctx) => {
  const photos = ctx.message.photo;
  const caption = ctx.message.caption?.trim();
  const mediaGroupId = ctx.message.media_group_id;
  const chatId = ctx.chat.id;
  const userId = ctx.from.id.toString();

  // Lấy ảnh có độ phân giải cao nhất (phần tử cuối mảng)
  const largestPhoto = photos[photos.length - 1];
  const fileId = largestPhoto?.file_id;

  if (!fileId) {
    await ctx.reply('⚠️ Không tìm thấy tệp ảnh hợp lệ.');
    return;
  }

  logger.info({ chatId, userId, fileId, caption }, 'Nhận ảnh hoá đơn');

  const added = messageBufferManager.addPhoto(
    chatId,
    userId,
    { fileId, caption, mediaGroupId },
    processReceiptBuffer,
  );
  if (!added) {
    logger.info({ chatId, mediaGroupId }, 'Ảnh thuộc album đã được xử lý -> Bỏ qua');
    return;
  }

  // Ảnh có chú thích = đã có ghi chú -> xử lý ngay
  if (caption) {
    void messageBufferManager.flush(chatId, processReceiptBuffer);
    await ctx.reply('🧾 Đã nhận ảnh hoá đơn kèm ghi chú, đang xử lý...');
    return;
  }

  // Chỉ nhắc 1 lần cho mỗi lượt gom (album nhiều ảnh không bị nhắc lặp)
  if (added.isNew) {
    await ctx.reply(
      '🧾 Đã nhận ảnh hoá đơn!\nGửi thêm ghi chú bằng tin nhắn text, hoặc bấm ⚡ Xử lý ngay. Sau 2 phút bot sẽ tự xử lý.',
      { reply_markup: createProcessNowKeyboard(added.buffer.id) },
    );
  }
});
