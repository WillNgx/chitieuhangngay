import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDays, subDays } from 'date-fns';
import { receiptService } from '../src/modules/receipt/receipt.service.js';
import { runReceiptCleanup } from '../src/modules/receipt/receipt-cleanup.job.js';
import { prisma } from '../src/infrastructure/database/prisma.js';
import { storageService } from '../src/modules/receipt/storage.service.js';

vi.mock('../src/infrastructure/database/prisma.js', () => ({
  prisma: {
    receipt: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/modules/receipt/storage.service.js', () => ({
  storageService: {
    uploadReceipt: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

describe('Receipt Service & Auto-cleanup 2 tháng (Phase 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tính toán expires_at đúng 60 ngày sau khi tạo', async () => {
    (storageService.uploadReceipt as any).mockResolvedValue('receipts/mock-path.jpg');
    (prisma.receipt.create as any).mockImplementation((args: any) => ({
      id: 'receipt-123',
      ...args.data,
    }));

    const dummyBuffer = Buffer.from('fake image bytes');
    const receipt = await receiptService.saveReceipt({
      telegramFileId: 'tg-file-1',
      imageBuffer: dummyBuffer,
      transactionId: 'tx-1',
      ocrData: { total: '250 THB' },
    });

    expect(prisma.receipt.create).toHaveBeenCalled();
    const createCall = (prisma.receipt.create as any).mock.calls[0][0].data;

    // expiresAt phải là tương lai ~60 ngày
    const expectedApprox = addDays(new Date(), 60).getTime();
    const actual = new Date(createCall.expiresAt).getTime();
    expect(Math.abs(actual - expectedApprox)).toBeLessThan(5000); // chênh lệch dưới 5s
    expect(createCall.storageKey).toBe('receipts/mock-path.jpg');
  });

  it('job cleanup chỉ xoá storage_key khi hết hạn 2 tháng, giữ nguyên ocr_data', async () => {
    const expiredReceipt = {
      id: 'old-receipt-1',
      storageKey: 'receipts/old.jpg',
      expiresAt: subDays(new Date(), 1), // đã hết hạn hôm qua
      ocrData: { text: 'Coffee 50k' },
      transactionId: 'tx-999',
    };

    (prisma.receipt.findMany as any).mockResolvedValue([expiredReceipt]);
    (storageService.deleteFile as any).mockResolvedValue(true);
    (prisma.receipt.update as any).mockResolvedValue({ ...expiredReceipt, storageKey: null });

    const result = await runReceiptCleanup();

    expect(result.deletedCount).toBe(1);
    expect(storageService.deleteFile).toHaveBeenCalledWith('receipts/old.jpg');
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: 'old-receipt-1' },
      data: { storageKey: null }, // chỉ set storageKey null, không xoá record hay ocr_data
    });
  });
});
