import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../src/modules/auth/auth.service.js';
import { prisma } from '../src/infrastructure/database/prisma.js';
import { env } from '../src/app/config.js';

vi.mock('../src/infrastructure/database/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('AuthService (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nên trả về false nếu user chưa tồn tại hoặc isAuthorized = false', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const result1 = await authService.isUserAuthorized('123456');
    expect(result1).toBe(false);

    (prisma.user.findUnique as any).mockResolvedValue({ isAuthorized: false });
    const result2 = await authService.isUserAuthorized('123456');
    expect(result2).toBe(false);
  });

  it('nên trả về true nếu user đã có isAuthorized = true', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ isAuthorized: true });
    const result = await authService.isUserAuthorized('123456');
    expect(result).toBe(true);
  });

  it('nên từ chối nếu nhập sai mật khẩu BOT_ACCESS_PASSWORD', async () => {
    const result = await authService.verifyAndAuthorize('123456', 'Alice', 'wrong_password');
    expect(result.success).toBe(false);
    expect(result.message).toContain('không chính xác');
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('nên xác thực thành công và lưu user khi nhập đúng mật khẩu', async () => {
    (prisma.user.upsert as any).mockResolvedValue({
      id: 'mock-uuid',
      telegramId: '123456',
      displayName: 'Alice',
      isAuthorized: true,
    });

    const result = await authService.verifyAndAuthorize('123456', 'Alice', env.BOT_ACCESS_PASSWORD);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Xác thực thành công');
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { telegramId: '123456' },
      create: {
        telegramId: '123456',
        displayName: 'Alice',
        isAuthorized: true,
      },
      update: {
        displayName: 'Alice',
        isAuthorized: true,
      },
    });
  });
});
