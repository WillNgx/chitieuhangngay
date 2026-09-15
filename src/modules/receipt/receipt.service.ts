import sharp from 'sharp';
import { addDays } from 'date-fns';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { storageService } from './storage.service.js';
import { logger } from '../../shared/logger/index.js';

export interface ProcessReceiptOptions {
  telegramFileId: string;
  imageBuffer: Buffer;
  mimeType?: string;
  transactionId?: string;
  ocrData?: Prisma.InputJsonValue;
}

export class ReceiptService {
  /**
   * Nén ảnh bằng Sharp để tối ưu dung lượng lưu trữ và xử lý AI
   */
  async compressImage(
    buffer: Buffer,
  ): Promise<{ compressedBuffer: Buffer; mimeType: string; size: number }> {
    try {
      const compressedBuffer = await sharp(buffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      return {
        compressedBuffer,
        mimeType: 'image/jpeg',
        size: compressedBuffer.length,
      };
    } catch (err) {
      logger.warn({ err }, 'Sharp không nén được ảnh, giữ nguyên buffer gốc');
      return {
        compressedBuffer: buffer,
        mimeType: 'image/jpeg',
        size: buffer.length,
      };
    }
  }

  /**
   * Xử lý lưu trữ hoá đơn: Nén -> Upload Storage -> Lưu DB với expires_at = +60 ngày
   */
  async saveReceipt(options: ProcessReceiptOptions) {
    const { telegramFileId, imageBuffer, transactionId, ocrData } = options;

    // 1. Nén ảnh
    const { compressedBuffer, mimeType, size } = await this.compressImage(imageBuffer);

    // 2. Upload lên Supabase Storage
    const fileName = `receipt_${Date.now()}_${telegramFileId.slice(0, 10)}.jpg`;
    const storageKey = await storageService.uploadReceipt(fileName, compressedBuffer, mimeType);

    // 3. Thời hạn lưu trữ: 2 tháng (60 ngày)
    const expiresAt = addDays(new Date(), 60);

    // 4. Lưu vào cơ sở dữ liệu
    let receipt;
    try {
      receipt = await prisma.receipt.create({
        data: {
          telegramFileId,
          storageKey,
          mimeType,
          fileSize: size,
          ocrData: ocrData || {},
          expiresAt,
          transactionId: transactionId || null,
        },
      });
    } catch (error) {
      await storageService.deleteFile(storageKey).catch(() => undefined);
      throw error;
    }

    logger.info(
      { receiptId: receipt.id, storageKey, expiresAt: expiresAt.toISOString() },
      'Đã lưu hoá đơn vào cơ sở dữ liệu',
    );

    return receipt;
  }
}

export const receiptService = new ReceiptService();
