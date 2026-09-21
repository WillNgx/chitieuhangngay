import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { transactionService } from '../src/modules/transaction/transaction.service.js';
import { transactionRepository } from '../src/modules/transaction/transaction.repository.js';
import { currencyService } from '../src/modules/currency/currency.service.js';

vi.mock('../src/modules/transaction/transaction.repository.js', () => ({
  transactionRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findOrCreateCategory: vi.fn(),
    findPendingBatch: vi.fn(),
    findPendingUpdatedBefore: vi.fn(),
    updateStatusMany: vi.fn(),
  },
}));

vi.mock('../src/modules/currency/currency.service.js', () => ({
  currencyService: {
    getExchangeRate: vi.fn(),
  },
}));

describe('TransactionService & Decimal Currency (Phase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tính toán quy đổi USD chính xác bằng Prisma.Decimal (850 THB * 0.0309 = 26.265 USD)', async () => {
    const amount = new Prisma.Decimal('850');
    const rate = new Prisma.Decimal('0.03094');

    (currencyService.getExchangeRate as any).mockResolvedValue({
      baseCurrency: 'THB',
      targetCurrency: 'USD',
      rate,
      date: new Date('2026-03-01T12:00:00Z'),
      provider: 'frankfurter',
    });

    (transactionRepository.findOrCreateCategory as any).mockResolvedValue({
      id: 'cat-restaurant-id',
      name: 'Restaurant',
    });

    (transactionRepository.create as any).mockImplementation((args: any) => ({
      id: 'tx-123',
      ...args.data,
      usdAmount: args.usdAmount,
      status: args.status,
    }));

    const tx = await transactionService.createPendingTransaction({
      userId: 'user-1',
      amount,
      currency: 'THB',
      categoryName: 'Food',
      subcategoryName: 'Restaurant',
      merchant: 'ABC Restaurant',
      purpose: 'Dinner',
      description: 'Ăn tối 850 THB',
      transactionAt: new Date('2026-03-01T12:00:00Z'),
    });

    expect(transactionRepository.create).toHaveBeenCalled();
    const createdArgs = (transactionRepository.create as any).mock.calls[0][0];

    // Kiểm tra usdAmount là Decimal và bằng amount * rate
    expect(createdArgs.usdAmount instanceof Prisma.Decimal).toBe(true);
    expect(createdArgs.usdAmount.toString()).toBe('26.299'); // 850 * 0.03094
    expect(createdArgs.status).toBe('pending_confirm');
    expect(createdArgs.exchangeRate.toString()).toBe('0.03094');
  });

  it('xác nhận giao dịch chuyển status sang confirmed', async () => {
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-123',
      status: 'pending_confirm',
    });
    (transactionRepository.updateStatus as any).mockResolvedValue({
      id: 'tx-123',
      status: 'confirmed',
    });

    const confirmed = await transactionService.confirmTransaction('tx-123');
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith('tx-123', 'confirmed');
    expect(confirmed.status).toBe('confirmed');
  });

  it('huỷ giao dịch chuyển status sang rejected', async () => {
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-123',
      status: 'pending_confirm',
    });
    (transactionRepository.updateStatus as any).mockResolvedValue({
      id: 'tx-123',
      status: 'rejected',
    });

    const rejected = await transactionService.rejectTransaction('tx-123');
    expect(transactionRepository.updateStatus).toHaveBeenCalledWith('tx-123', 'rejected');
    expect(rejected.status).toBe('rejected');
  });

  it('từ chối xác nhận giao dịch đã confirmed', async () => {
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-123',
      status: 'confirmed',
    });

    await expect(transactionService.confirmTransaction('tx-123')).rejects.toThrow(
      'đang chờ xác nhận',
    );
    expect(transactionRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('cho sửa giao dịch đang chờ xác nhận (nút ✏️ Sửa trên bản xem trước), nhưng chỉ xoá giao dịch đã confirmed', async () => {
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-123',
      status: 'pending_confirm',
      categoryId: null,
    });
    (transactionRepository.update as any).mockResolvedValue({ id: 'tx-123', merchant: 'ABC' });

    await expect(
      transactionService.updateTransaction('tx-123', { merchant: 'ABC' }),
    ).resolves.toMatchObject({ merchant: 'ABC' });
    await expect(transactionService.deleteTransaction('tx-123')).rejects.toThrow('đã xác nhận');
  });

  it('không cho sửa giao dịch đã bị huỷ', async () => {
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-123',
      status: 'rejected',
    });

    await expect(transactionService.updateTransaction('tx-123', {})).rejects.toThrow('đã bị huỷ');
    expect(transactionRepository.update).not.toHaveBeenCalled();
  });

  it('xác nhận cả nhóm giao dịch của tin nhắn nhiều khoản', async () => {
    const transactionAt = new Date('2026-09-21T06:00:00Z');
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      transactionAt,
      status: 'pending_confirm',
    });
    (transactionRepository.findPendingBatch as any).mockResolvedValue([
      { id: 'tx-1' },
      { id: 'tx-2' },
      { id: 'tx-3' },
    ]);

    const batch = await transactionService.confirmBatch('tx-1');

    expect(transactionRepository.findPendingBatch).toHaveBeenCalledWith('user-1', transactionAt);
    expect(transactionRepository.updateStatusMany).toHaveBeenCalledWith(
      ['tx-1', 'tx-2', 'tx-3'],
      'confirmed',
    );
    expect(batch).toHaveLength(3);
  });

  it('tự động xác nhận giao dịch quá 5 phút, gom theo nhóm để tin nhiều khoản xác nhận cùng lúc', async () => {
    const batchAt = new Date('2026-09-21T06:00:00Z');
    const singleAt = new Date('2026-09-21T06:01:00Z');
    (transactionRepository.findPendingUpdatedBefore as any).mockResolvedValue([
      { userId: 'user-1', transactionAt: batchAt },
      { userId: 'user-1', transactionAt: batchAt },
      { userId: 'user-2', transactionAt: singleAt },
    ]);
    (transactionRepository.findPendingBatch as any).mockImplementation(
      async (_userId: string, at: Date) =>
        at === batchAt ? [{ id: 'tx-1' }, { id: 'tx-2' }] : [{ id: 'tx-3' }],
    );
    (transactionRepository.updateStatusMany as any).mockResolvedValue({ count: 1 });

    const groups = await transactionService.autoConfirmExpired(new Date());

    expect(transactionRepository.findPendingBatch).toHaveBeenCalledTimes(2);
    expect(transactionRepository.updateStatusMany).toHaveBeenCalledWith(
      ['tx-1', 'tx-2'],
      'confirmed',
    );
    expect(transactionRepository.updateStatusMany).toHaveBeenCalledWith(['tx-3'], 'confirmed');
    expect(groups).toHaveLength(2);
  });

  it('bỏ qua nhóm vừa được người dùng tự xác nhận/huỷ cùng lúc (count = 0)', async () => {
    (transactionRepository.findPendingUpdatedBefore as any).mockResolvedValue([
      { userId: 'user-1', transactionAt: new Date() },
    ]);
    (transactionRepository.findPendingBatch as any).mockResolvedValue([{ id: 'tx-1' }]);
    (transactionRepository.updateStatusMany as any).mockResolvedValue({ count: 0 });

    await expect(transactionService.autoConfirmExpired(new Date())).resolves.toHaveLength(0);
  });

  it('báo lỗi khi bấm lại nút của nhóm đã được xử lý', async () => {
    (transactionRepository.findById as any).mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      transactionAt: new Date(),
      status: 'confirmed',
    });
    (transactionRepository.findPendingBatch as any).mockResolvedValue([]);

    await expect(transactionService.rejectBatch('tx-1')).rejects.toThrow('đã được xử lý');
    expect(transactionRepository.updateStatusMany).not.toHaveBeenCalled();
  });
});
