import { prisma } from '../../infrastructure/database/prisma.js';
import { storageService } from './storage.service.js';
import { logger } from '../../shared/logger/index.js';

export async function runReceiptCleanup(): Promise<{ deletedCount: number }> {
  logger.info('🧹 Bắt đầu job dọn dẹp hoá đơn hết hạn (sau 2 tháng)...');

  const now = new Date();

  // Tìm các receipt có expires_at <= hiện tại và storage_key vẫn còn
  const expiredReceipts = await prisma.receipt.findMany({
    where: {
      expiresAt: { lte: now },
      storageKey: { not: null },
    },
    take: 100, // giới hạn mỗi batch
  });

  if (expiredReceipts.length === 0) {
    logger.info('Không có hoá đơn nào hết hạn cần dọn dẹp.');
    return { deletedCount: 0 };
  }

  logger.info(`Phát hiện ${expiredReceipts.length} hoá đơn đã quá 2 tháng, bắt đầu xoá ảnh...`);
  let deletedCount = 0;

  for (const receipt of expiredReceipts) {
    if (!receipt.storageKey) continue;

    try {
      // 1. Xoá file trên Storage
      const success = await storageService.deleteFile(receipt.storageKey);

      if (success) {
        // 2. Cập nhật DB: storage_key = null (giữ nguyên ocr_data và transaction_id)
        await prisma.receipt.update({
          where: { id: receipt.id },
          data: { storageKey: null },
        });

        deletedCount++;
        logger.info(
          { receiptId: receipt.id, transactionId: receipt.transactionId },
          'Đã xoá ảnh hoá đơn khỏi storage, giữ lại ocr_data',
        );
      }
    } catch (err) {
      logger.error({ err, receiptId: receipt.id }, 'Lỗi khi dọn dẹp hoá đơn');
    }
  }

  logger.info(
    `✅ Hoàn tất job dọn dẹp: đã xử lý ${deletedCount}/${expiredReceipts.length} hoá đơn.`,
  );
  return { deletedCount };
}
