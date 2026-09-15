import { prisma } from '../../infrastructure/database/prisma.js';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';

export class AuthService {
  /**
   * Kiểm tra xem user có tồn tại và đã được cấp quyền (isAuthorized = true) hay chưa
   */
  async isUserAuthorized(telegramId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { isAuthorized: true },
    });
    return !!user?.isAuthorized;
  }

  /**
   * Lấy thông tin user theo telegramId
   */
  async getUserByTelegramId(telegramId: string) {
    return prisma.user.findUnique({
      where: { telegramId },
    });
  }

  /**
   * Thử xác thực người dùng bằng mật khẩu
   */
  async verifyAndAuthorize(
    telegramId: string,
    displayName: string,
    passwordAttempt: string,
  ): Promise<{ success: boolean; message: string }> {
    const trimmedInput = passwordAttempt.trim();

    if (trimmedInput !== env.BOT_ACCESS_PASSWORD) {
      logger.warn({ telegramId, displayName }, 'Xác thực mật khẩu thất bại');
      return {
        success: false,
        message: '❌ Mật khẩu truy cập không chính xác. Vui lòng nhập lại mật khẩu để tiếp tục:',
      };
    }

    // Nhập đúng mật khẩu -> upsert user record với is_authorized = true
    const user = await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        displayName,
        isAuthorized: true,
      },
      update: {
        displayName,
        isAuthorized: true,
      },
    });

    logger.info({ telegramId: user.telegramId, userId: user.id }, 'Xác thực người dùng thành công');

    return {
      success: true,
      message:
        '🎉 Xác thực thành công! Bạn đã được cấp quyền sử dụng Telegram Expense Tracker Bot.\n\n' +
        'Hãy gửi tin nhắn mô tả chi tiêu (vd: "Ăn tối 250 THB") hoặc gửi ảnh hoá đơn để bắt đầu.',
    };
  }
}

export const authService = new AuthService();
