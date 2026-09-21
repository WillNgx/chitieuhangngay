import { describe, it, expect } from 'vitest';
import { PreviewRegistry } from '../src/telegram/preview-registry.js';
import { resolveKeepAliveUrl } from '../src/app/keep-alive.js';

describe('PreviewRegistry (vị trí tin xem trước cho job tự xác nhận)', () => {
  it('lấy được vị trí tin xem trước của cả nhóm và xoá sau khi lấy', () => {
    const registry = new PreviewRegistry();
    registry.register(['tx-1', 'tx-2'], { chatId: 1, messageId: 100 });

    expect(registry.take(['tx-2', 'tx-1'])).toEqual({ chatId: 1, messageId: 100 });
    expect(registry.take(['tx-1', 'tx-2'])).toBeUndefined();
  });

  it('tin xem trước mới (sau khi sửa) thay cho tin cũ', () => {
    const registry = new PreviewRegistry();
    registry.register(['tx-1'], { chatId: 1, messageId: 100 });
    registry.register(['tx-1'], { chatId: 1, messageId: 200 });

    expect(registry.take(['tx-1'])?.messageId).toBe(200);
  });

  it('forget xoá vị trí khi người dùng tự bấm xác nhận/huỷ', () => {
    const registry = new PreviewRegistry();
    registry.register(['tx-1'], { chatId: 1, messageId: 100 });
    registry.forget(['tx-1']);

    expect(registry.take(['tx-1'])).toBeUndefined();
  });
});

describe('Keep-alive URL', () => {
  it('ưu tiên RENDER_EXTERNAL_URL, trỏ về /health', () => {
    expect(
      resolveKeepAliveUrl({
        renderExternalUrl: 'https://bot.onrender.com',
        telegramWebhookUrl: 'https://khac.example.com/telegram/webhook',
      }),
    ).toBe('https://bot.onrender.com/health');
  });

  it('dùng domain của TELEGRAM_WEBHOOK_URL khi không có RENDER_EXTERNAL_URL', () => {
    expect(
      resolveKeepAliveUrl({ telegramWebhookUrl: 'https://bot.onrender.com/telegram/webhook' }),
    ).toBe('https://bot.onrender.com/health');
  });

  it('trả về null khi không có hoặc URL không hợp lệ', () => {
    expect(resolveKeepAliveUrl({})).toBeNull();
    expect(resolveKeepAliveUrl({ telegramWebhookUrl: 'khong-phai-url' })).toBeNull();
  });
});
