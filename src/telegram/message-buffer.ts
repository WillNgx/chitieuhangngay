import { logger } from '../shared/logger/index.js';

export interface BufferedPhoto {
  fileId: string;
  caption?: string;
}

export interface ChatBuffer {
  chatId: number;
  userId: string;
  texts: string[];
  photos: BufferedPhoto[];
  timer: NodeJS.Timeout | null;
  startedAt: Date;
}

export type FlushHandler = (buffer: ChatBuffer) => Promise<void>;

export class MessageBufferManager {
  private buffers = new Map<number, ChatBuffer>();
  private readonly BUFFER_WINDOW_MS = 3 * 60 * 1000; // 3 phút

  /**
   * Thêm tin nhắn text vào buffer
   */
  async addText(
    chatId: number,
    userId: string,
    text: string,
    onFlush: FlushHandler,
  ): Promise<void> {
    const existing = this.buffers.get(chatId);

    // Nếu đã có buffer và buffer đó đã có text -> coi như bắt đầu giao dịch mới
    // Chốt giao dịch cũ ngay lập tức
    if (existing && existing.texts.length > 0) {
      logger.info(
        { chatId },
        'Phát hiện tin nhắn text mới trong khi buffer cũ còn tồn tại -> Chốt giao dịch cũ',
      );
      await this.flush(chatId, onFlush);
    }

    // Lấy lại buffer (nếu vừa flush thì map đã bị xoá)
    let buffer = this.buffers.get(chatId);

    if (!buffer) {
      buffer = {
        chatId,
        userId,
        texts: [text],
        photos: [],
        timer: null,
        startedAt: new Date(),
      };
      this.buffers.set(chatId, buffer);

      // Đặt hẹn giờ 3 phút
      buffer.timer = setTimeout(async () => {
        logger.info({ chatId }, 'Hết thời gian buffer 3 phút -> Chốt giao dịch');
        await this.flush(chatId, onFlush);
      }, this.BUFFER_WINDOW_MS);
    } else {
      // Buffer trước đó chỉ có ảnh, chưa có text -> gộp text vào
      buffer.texts.push(text);
    }
  }

  /**
   * Thêm ảnh vào buffer
   */
  async addPhoto(
    chatId: number,
    userId: string,
    photo: BufferedPhoto,
    onFlush: FlushHandler,
  ): Promise<void> {
    let buffer = this.buffers.get(chatId);

    if (!buffer) {
      buffer = {
        chatId,
        userId,
        texts: photo.caption ? [photo.caption] : [],
        photos: [photo],
        timer: null,
        startedAt: new Date(),
      };
      this.buffers.set(chatId, buffer);

      buffer.timer = setTimeout(async () => {
        logger.info({ chatId }, 'Hết thời gian buffer 3 phút -> Chốt giao dịch ảnh');
        await this.flush(chatId, onFlush);
      }, this.BUFFER_WINDOW_MS);
    } else {
      // Gộp ảnh vào buffer hiện có
      buffer.photos.push(photo);
      if (photo.caption) {
        buffer.texts.push(photo.caption);
      }
    }
  }

  /**
   * Chốt buffer ngay lập tức và gọi handler xử lý
   */
  async flush(chatId: number, onFlush: FlushHandler): Promise<void> {
    const buffer = this.buffers.get(chatId);
    if (!buffer) {
      return;
    }

    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    this.buffers.delete(chatId);

    try {
      await onFlush(buffer);
    } catch (err) {
      logger.error({ err, chatId }, 'Lỗi khi xử lý flush buffer');
    }
  }

  /**
   * Xoá buffer mà không xử lý (vd khi user huỷ)
   */
  clear(chatId: number): void {
    const buffer = this.buffers.get(chatId);
    if (buffer?.timer) {
      clearTimeout(buffer.timer);
    }
    this.buffers.delete(chatId);
  }

  getBuffer(chatId: number): ChatBuffer | undefined {
    return this.buffers.get(chatId);
  }
}

export const messageBufferManager = new MessageBufferManager();
