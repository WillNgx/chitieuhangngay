import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';

export class StorageService {
  private client: SupabaseClient | null = null;
  private bucket: string;

  constructor() {
    this.bucket = env.SUPABASE_BUCKET_RECEIPTS;
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && !env.SUPABASE_URL.includes('dummy')) {
      this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  /**
   * Tải ảnh hoá đơn lên object storage
   */
  async uploadReceipt(fileName: string, fileBuffer: Buffer, contentType: string): Promise<string> {
    if (!this.client) {
      throw new Error('Supabase Storage chưa được cấu hình');
    }

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      logger.error({ error, fileName }, 'Lỗi upload ảnh lên Supabase Storage');
      throw new Error(`Upload ảnh hoá đơn thất bại: ${error.message}`);
    }

    return data.path;
  }

  /**
   * Xoá file trên storage khi đến hạn TTL
   */
  async deleteFile(storageKey: string): Promise<boolean> {
    if (!this.client) {
      logger.info({ storageKey }, 'Giả lập xoá file storage mock thành công');
      return true;
    }

    const { error } = await this.client.storage.from(this.bucket).remove([storageKey]);

    if (error) {
      logger.error({ error, storageKey }, 'Lỗi khi xoá file trên Supabase Storage');
      return false;
    }

    logger.info({ storageKey }, 'Đã xoá file thành công khỏi Supabase Storage');
    return true;
  }
}

export const storageService = new StorageService();
