import { Context, NextFunction } from 'grammy';
import { authService } from '../../modules/auth/auth.service.js';
import { logger } from '../../shared/logger/index.js';

export async function authMiddleware(ctx: Context, next: NextFunction) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id.toString();
  const displayName =
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
    ctx.from.username ||
    'User';

  const isAuthorized = await authService.isUserAuthorized(telegramId);

  if (isAuthorized) {
    return await next();
  }

  // Nếu chưa authorized
  const text = ctx.message?.text?.trim();

  // Nếu người dùng gửi tin nhắn text, kiểm tra xem có phải là mật khẩu không
  if (text) {
    // Bỏ qua lệnh /start nếu chỉ gửi lệnh đơn thuần
    if (text === '/start') {
      await ctx.reply(
        '👋 Chào mừng bạn đến với Telegram Expense Tracker Bot!\n\n' +
          '🔒 Bot này dành riêng cho gia đình và yêu cầu mật khẩu truy cập.\n' +
          'Vui lòng nhập mật khẩu để kích hoạt tài khoản:',
      );
      return;
    }

    const authResult = await authService.verifyAndAuthorize(telegramId, displayName, text);
    await ctx.reply(authResult.message);
    return;
  }

  // Trường hợp gửi ảnh hoặc tương tác khác khi chưa đăng nhập
  logger.warn({ telegramId }, 'Từ chối thao tác do người dùng chưa xác thực');
  await ctx.reply(
    '🔒 Bạn chưa được xác thực quyền sử dụng bot.\n' +
      'Vui lòng nhập mật khẩu truy cập trước khi tiếp tục:',
  );
}
