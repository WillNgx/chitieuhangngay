import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { reportService } from '../src/modules/analytics/report.service.js';
import { prisma } from '../src/infrastructure/database/prisma.js';

vi.mock('../src/infrastructure/database/prisma.js', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
    },
  },
}));

describe('ReportService & Analytics USD (Phase 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tổng hợp chi tiêu USD trên toàn bộ ví chung và tính tỷ lệ category chính xác', async () => {
    const mockTransactions = [
      {
        id: 'tx-1',
        usdAmount: new Prisma.Decimal('60.00'),
        status: 'confirmed',
        category: { name: 'Restaurant', parent: { name: 'Food' } },
        user: { displayName: 'Alice' },
      },
      {
        id: 'tx-2',
        usdAmount: new Prisma.Decimal('40.00'),
        status: 'confirmed',
        category: { name: 'Coffee', parent: { name: 'Food' } },
        user: { displayName: 'Bob' },
      },
      {
        id: 'tx-3',
        usdAmount: new Prisma.Decimal('100.00'),
        status: 'confirmed',
        category: { name: 'Grab', parent: { name: 'Transport' } },
        user: { displayName: 'Alice' },
      },
    ];

    (prisma.transaction.findMany as any).mockResolvedValue(mockTransactions);

    const now = new Date();
    const result = await reportService.getExpensesSummary(new Date('2026-03-01'), now);

    // Tổng USD: 60 + 40 + 100 = 200.00
    expect(result.totalUsd.toString()).toBe('200');
    expect(result.transactionCount).toBe(3);

    // Categories: Food (100 USD = 50%), Transport (100 USD = 50%)
    expect(result.categories.length).toBe(2);
    expect(result.categories[0].usdAmount.toString()).toBe('100');
    expect(result.categories[0].percentage).toBe(50);
    expect(result.categories[1].percentage).toBe(50);

    // Format text
    const message = reportService.formatReportMessage('Báo cáo Tháng này', result);
    expect(message).toContain('$200.00 USD');
    expect(message).toContain('Food');
    expect(message).toContain('Transport');
  });

  it('trả về thông báo trống nếu không có giao dịch confirmed nào', async () => {
    (prisma.transaction.findMany as any).mockResolvedValue([]);

    const result = await reportService.getExpensesSummary(new Date(), new Date());
    expect(result.totalUsd.toString()).toBe('0');
    expect(result.transactionCount).toBe(0);

    const message = reportService.formatReportMessage('Báo cáo Tuần này', result);
    expect(message).toContain('Chưa có chi tiêu nào được xác nhận');
  });
});
