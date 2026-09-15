import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBufferManager } from '../src/telegram/message-buffer.js';
import { createTransactionPreviewKeyboard } from '../src/telegram/keyboards/transaction.keyboard.js';

describe('MessageBufferManager & Luồng xác nhận (Phase 5)', () => {
  let bufferManager: MessageBufferManager;

  beforeEach(() => {
    vi.useFakeTimers();
    bufferManager = new MessageBufferManager();
  });

  it('gộp ảnh và text gửi trong vòng 3 phút vào cùng 1 buffer', async () => {
    const onFlush = vi.fn();
    const chatId = 999;
    const userId = 'user-999';

    // 1. Gửi ảnh trước
    await bufferManager.addPhoto(chatId, userId, { fileId: 'photo-1' }, onFlush);

    // 2. Gửi text chú thích sau 30 giây
    vi.advanceTimersByTime(30 * 1000);
    await bufferManager.addText(chatId, userId, 'Ăn tối cùng cả nhà', onFlush);

    const currentBuffer = bufferManager.getBuffer(chatId);
    expect(currentBuffer).toBeDefined();
    expect(currentBuffer?.photos.length).toBe(1);
    expect(currentBuffer?.texts).toContain('Ăn tối cùng cả nhà');
    expect(onFlush).not.toHaveBeenCalled();

    // 3. Tiến tới hết 3 phút -> tự động trigger onFlush
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(bufferManager.getBuffer(chatId)).toBeUndefined();
  });

  it('chốt giao dịch cũ ngay khi người dùng gửi 1 tin nhắn text mới', async () => {
    const onFlush = vi.fn();
    const chatId = 888;
    const userId = 'user-888';

    // Giao dịch 1: text đầu tiên
    await bufferManager.addText(chatId, userId, 'Cà phê 45k', onFlush);
    expect(onFlush).not.toHaveBeenCalled();

    // Người dùng gửi tin nhắn text mới trước khi hết 3 phút -> chốt giao dịch 1 ngay lập tức
    vi.advanceTimersByTime(60 * 1000);
    await bufferManager.addText(chatId, userId, 'Đổ xăng 100k', onFlush);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0].texts).toEqual(['Cà phê 45k']);

    // Buffer mới chứa giao dịch 2
    const current = bufferManager.getBuffer(chatId);
    expect(current?.texts).toEqual(['Đổ xăng 100k']);
  });

  it('bàn phím Inline Keyboard có đầy đủ 3 nút [Xác nhận, Sửa, Huỷ]', () => {
    const keyboard = createTransactionPreviewKeyboard('test-tx-id');
    const buttons = keyboard.inline_keyboard[0];

    expect(buttons.length).toBe(3);
    expect(buttons[0].text).toContain('Xác nhận');
    expect(buttons[0].callback_data).toBe('tx_confirm:test-tx-id');

    expect(buttons[1].text).toContain('Sửa');
    expect(buttons[1].callback_data).toBe('tx_edit:test-tx-id');

    expect(buttons[2].text).toContain('Huỷ');
    expect(buttons[2].callback_data).toBe('tx_cancel:test-tx-id');
  });
});
