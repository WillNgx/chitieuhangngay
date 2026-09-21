import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { MessageBufferManager } from '../src/telegram/message-buffer.js';
import {
  createBatchPreviewKeyboard,
  createProcessNowKeyboard,
  createTransactionPreviewKeyboard,
} from '../src/telegram/keyboards/transaction.keyboard.js';
import { formatBatchPreview } from '../src/telegram/utils/preview-formatter.js';

describe('MessageBufferManager (gom ảnh hoá đơn) & Luồng xác nhận', () => {
  let bufferManager: MessageBufferManager;

  beforeEach(() => {
    vi.useFakeTimers();
    bufferManager = new MessageBufferManager();
  });

  it('gom các ảnh cùng album vào 1 lượt và tự xử lý sau 2 phút', async () => {
    const onFlush = vi.fn();
    const chatId = 999;

    const first = bufferManager.addPhoto(
      chatId,
      'u',
      { fileId: 'p1', mediaGroupId: 'g1' },
      onFlush,
    );
    const second = bufferManager.addPhoto(
      chatId,
      'u',
      { fileId: 'p2', mediaGroupId: 'g1' },
      onFlush,
    );

    expect(first?.isNew).toBe(true);
    expect(second?.isNew).toBe(false);
    expect(bufferManager.getBuffer(chatId)?.photos.length).toBe(2);

    vi.advanceTimersByTime(2 * 60 * 1000 - 1);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(bufferManager.getBuffer(chatId)).toBeUndefined();
  });

  it('tin text khi đang có ảnh chờ -> thành ghi chú của ảnh và xử lý ngay', () => {
    const onFlush = vi.fn();
    const chatId = 888;

    bufferManager.addPhoto(chatId, 'u', { fileId: 'p1' }, onFlush);
    const attached = bufferManager.attachNoteAndFlush(chatId, 'Ăn tối cùng cả nhà', onFlush);

    expect(attached).toBe(true);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0].texts).toEqual(['Ăn tối cùng cả nhà']);
    expect(bufferManager.getBuffer(chatId)).toBeUndefined();
  });

  it('không có ảnh chờ -> tin text không bị gom (xử lý như khoản chi riêng)', () => {
    const onFlush = vi.fn();

    expect(bufferManager.attachNoteAndFlush(777, 'Cà phê 45k', onFlush)).toBe(false);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('nút ⚡ chỉ chốt đúng lượt gom, bấm lại lượt đã xử lý trả về false', () => {
    const onFlush = vi.fn();
    const chatId = 666;

    const added = bufferManager.addPhoto(chatId, 'u', { fileId: 'p1' }, onFlush);
    const bufferId = added!.buffer.id;

    expect(bufferManager.flushById(chatId, 'ma-khac', onFlush)).toBe(false);
    expect(bufferManager.flushById(chatId, bufferId, onFlush)).toBe(true);
    expect(bufferManager.flushById(chatId, bufferId, onFlush)).toBe(false);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('bỏ qua ảnh đến trễ của album đã xử lý (tránh tạo giao dịch trùng)', () => {
    const onFlush = vi.fn();
    const chatId = 555;

    bufferManager.addPhoto(
      chatId,
      'u',
      { fileId: 'p1', caption: 'Siêu thị', mediaGroupId: 'g1' },
      onFlush,
    );
    void bufferManager.flush(chatId, onFlush);

    expect(
      bufferManager.addPhoto(chatId, 'u', { fileId: 'p2', mediaGroupId: 'g1' }, onFlush),
    ).toBeNull();
    expect(bufferManager.getBuffer(chatId)).toBeUndefined();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('không chờ xử lý AI xong mới trả về (tránh timeout webhook)', () => {
    // onFlush giả lập gọi AI rất lâu, không bao giờ resolve
    const onFlush = vi.fn(() => new Promise<void>(() => undefined));
    const chatId = 444;

    bufferManager.addPhoto(chatId, 'u', { fileId: 'p1' }, onFlush);

    // attachNoteAndFlush trả về ngay dù onFlush chưa xong
    expect(bufferManager.attachNoteAndFlush(chatId, 'ghi chú', onFlush)).toBe(true);
    expect(onFlush).toHaveBeenCalledTimes(1);
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

  it('bàn phím nhiều khoản và nút ⚡ Xử lý ngay có callback_data đúng, không quá 64 byte', () => {
    const txId = '123e4567-e89b-12d3-a456-426614174000';
    const [confirmAll, cancelAll] = createBatchPreviewKeyboard(txId).inline_keyboard[0];
    const [processNow] = createProcessNowKeyboard(txId).inline_keyboard[0];

    expect(confirmAll.callback_data).toBe(`batch_confirm:${txId}`);
    expect(cancelAll.callback_data).toBe(`batch_cancel:${txId}`);
    expect(processNow.callback_data).toBe(`buffer_flush:${txId}`);
    for (const button of [confirmAll, cancelAll, processNow]) {
      expect(Buffer.byteLength(button.callback_data ?? '')).toBeLessThanOrEqual(64);
    }
  });

  it('xem trước nhiều khoản liệt kê từng khoản và cộng tổng USD bằng Decimal', () => {
    const tx = (description: string, amount: string, usd: string) => ({
      id: description,
      description,
      amount: new Prisma.Decimal(amount),
      currency: 'THB',
      usdAmount: new Prisma.Decimal(usd),
      category: { name: 'Restaurant', parent: { name: 'Food' } },
    });

    const text = formatBatchPreview([
      tx('Mỳ thuyền', '40', '1.10'),
      tx('Mỳ gà', '30', '0.83'),
      tx('Nước', '20', '0.55'),
    ]);

    expect(text).toContain('3 khoản chi');
    expect(text).toContain('1. Mỳ thuyền · 💰 40 THB ≈ $1.10 · 📂 Food → Restaurant');
    expect(text).toContain('3. Nước');
    expect(text).toContain('Tổng ≈ $2.48');
  });
});
