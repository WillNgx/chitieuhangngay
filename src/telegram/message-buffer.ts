import { randomUUID } from 'node:crypto';
import { logger } from '../shared/logger/index.js';

export interface BufferedPhoto {
  fileId: string;
  caption?: string;
  mediaGroupId?: string;
}

export interface ChatBuffer {
  // Mã lượt gom, dùng cho nút "⚡ Xử lý ngay"
  id: string;
  chatId: number;
  userId: string;
  texts: string[];
  photos: BufferedPhoto[];
  mediaGroupId?: string;
  timer: NodeJS.Timeout | null;
  startedAt: Date;
}

export type FlushHandler = (buffer: ChatBuffer) => Promise<void>;

/**
 * Gom ảnh hoá đơn theo chat để chờ ghi chú đi kèm.
 * Tin text không còn đi qua buffer (được xử lý ngay), chỉ ảnh mới phải chờ:
 * chốt khi có ghi chú (tin text), khi bấm "⚡ Xử lý ngay", hoặc tự chốt sau 2 phút.
 */
export class MessageBufferManager {
  private buffers = new Map<number, ChatBuffer>();
  // Album (media group) cuối cùng đã chốt của mỗi chat -> các ảnh đến trễ của album đó bị bỏ qua
  private flushedMediaGroups = new Map<number, string>();
  private readonly BUFFER_WINDOW_MS = 2 * 60 * 1000; // 2 phút

  /**
   * Thêm ảnh vào buffer. Trả về null nếu ảnh thuộc album đã được xử lý.
   */
  addPhoto(
    chatId: number,
    userId: string,
    photo: BufferedPhoto,
    onFlush: FlushHandler,
  ): { buffer: ChatBuffer; isNew: boolean } | null {
    if (photo.mediaGroupId && this.flushedMediaGroups.get(chatId) === photo.mediaGroupId) {
      return null;
    }

    const existing = this.buffers.get(chatId);
    if (existing) {
      // Gộp ảnh vào buffer hiện có (vd: các ảnh trong cùng 1 album)
      existing.photos.push(photo);
      if (photo.caption) {
        existing.texts.push(photo.caption);
      }
      return { buffer: existing, isNew: false };
    }

    const buffer: ChatBuffer = {
      id: randomUUID(),
      chatId,
      userId,
      texts: photo.caption ? [photo.caption] : [],
      photos: [photo],
      mediaGroupId: photo.mediaGroupId,
      timer: null,
      startedAt: new Date(),
    };
    this.buffers.set(chatId, buffer);

    buffer.timer = setTimeout(() => {
      logger.info({ chatId }, 'Hết thời gian chờ 2 phút -> Tự động xử lý ảnh hoá đơn');
      void this.flush(chatId, onFlush);
    }, this.BUFFER_WINDOW_MS);

    return { buffer, isNew: true };
  }

  /**
   * Nếu chat đang có ảnh chờ -> tin text này là ghi chú của ảnh, chốt xử lý ngay.
   * Trả về false nếu không có ảnh nào đang chờ.
   */
  attachNoteAndFlush(chatId: number, text: string, onFlush: FlushHandler): boolean {
    const buffer = this.buffers.get(chatId);
    if (!buffer) {
      return false;
    }
    buffer.texts.push(text);
    void this.flush(chatId, onFlush);
    return true;
  }

  /**
   * Chốt buffer theo mã lượt gom (nút "⚡ Xử lý ngay").
   * Trả về false nếu lượt gom đó đã được xử lý trước đó.
   */
  flushById(chatId: number, bufferId: string, onFlush: FlushHandler): boolean {
    if (this.buffers.get(chatId)?.id !== bufferId) {
      return false;
    }
    void this.flush(chatId, onFlush);
    return true;
  }

  /**
   * Chốt buffer ngay lập tức và gọi handler xử lý.
   * Phần xoá buffer chạy đồng bộ trước lần await đầu tiên, nên có thể gọi dạng `void flush()`
   * (chạy nền) mà vẫn an toàn; lỗi của onFlush được bắt tại đây.
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
    if (buffer.mediaGroupId) {
      this.flushedMediaGroups.set(chatId, buffer.mediaGroupId);
    }

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
