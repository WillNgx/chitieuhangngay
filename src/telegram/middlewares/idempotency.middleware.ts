import { Context, NextFunction } from 'grammy';
import { logger } from '../../shared/logger/index.js';
import { prisma } from '../../infrastructure/database/prisma.js';

export class IdempotencyManager {
  private processedUpdates = new Map<number, number>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 phút

  isProcessed(updateId: number): boolean {
    const existing = this.processedUpdates.get(updateId);
    if (existing && existing > Date.now()) {
      return true;
    }
    return false;
  }

  markProcessed(updateId: number): void {
    this.processedUpdates.set(updateId, Date.now() + this.TTL_MS);

    // Dọn dẹp cache cũ định kỳ nếu map quá lớn
    if (this.processedUpdates.size > 2000) {
      const now = Date.now();
      for (const [id, expiry] of this.processedUpdates.entries()) {
        if (expiry <= now) {
          this.processedUpdates.delete(id);
        }
      }
    }
  }
}

export const idempotencyManager = new IdempotencyManager();

export async function idempotencyMiddleware(ctx: Context, next: NextFunction) {
  const updateId = ctx.update.update_id;

  if (idempotencyManager.isProcessed(updateId)) {
    logger.warn({ updateId }, 'Phát hiện update_id trùng lặp từ Telegram retry -> Bỏ qua');
    return;
  }

  try {
    await prisma.telegramUpdate.create({ data: { updateId: BigInt(updateId) } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      idempotencyManager.markProcessed(updateId);
      logger.warn({ updateId }, 'Phát hiện update_id trùng lặp từ Telegram -> Bỏ qua');
      return;
    }
    throw error;
  }

  try {
    await next();
    idempotencyManager.markProcessed(updateId);
  } catch (error) {
    await prisma.telegramUpdate.delete({ where: { updateId: BigInt(updateId) } }).catch(() => undefined);
    throw error;
  }
}
