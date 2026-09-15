import { Prisma } from '@prisma/client';
import { startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { prisma } from '../../infrastructure/database/prisma.js';

export interface CategoryBreakdown {
  categoryName: string;
  usdAmount: Prisma.Decimal;
  percentage: number;
  count: number;
}

export interface ReportSummaryResult {
  totalUsd: Prisma.Decimal;
  transactionCount: number;
  categories: CategoryBreakdown[];
  startDate: Date;
  endDate: Date;
}

export class ReportService {
  /**
   * Tính tổng hợp chi tiêu theo khoảng thời gian trên toàn bộ ví chung gia đình
   */
  async getExpensesSummary(startDate: Date, endDate: Date): Promise<ReportSummaryResult> {
    const transactions = await prisma.transaction.findMany({
      where: {
        status: 'confirmed',
        transactionAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        user: true,
      },
    });

    let totalUsd = new Prisma.Decimal(0);
    const categoryMap = new Map<string, { total: Prisma.Decimal; count: number }>();

    for (const tx of transactions) {
      totalUsd = totalUsd.add(tx.usdAmount);

      // Nhóm theo category cha (hoặc category hiện tại nếu không có cha)
      const catName = tx.category?.parent ? tx.category.parent.name : tx.category?.name || 'Khác';

      const current = categoryMap.get(catName) || {
        total: new Prisma.Decimal(0),
        count: 0,
      };

      categoryMap.set(catName, {
        total: current.total.add(tx.usdAmount),
        count: current.count + 1,
      });
    }

    const categories: CategoryBreakdown[] = [];

    for (const [name, data] of categoryMap.entries()) {
      const percentage = totalUsd.isZero() ? 0 : data.total.mul(100).div(totalUsd).toNumber();

      categories.push({
        categoryName: name,
        usdAmount: data.total,
        percentage: Math.round(percentage * 10) / 10,
        count: data.count,
      });
    }

    // Sắp xếp danh mục theo số tiền giảm dần
    categories.sort((a, b) => b.usdAmount.minus(a.usdAmount).toNumber());

    return {
      totalUsd,
      transactionCount: transactions.length,
      categories,
      startDate,
      endDate,
    };
  }

  /**
   * Báo cáo tuần này
   */
  async getWeekReport(timezone = 'Asia/Bangkok'): Promise<ReportSummaryResult> {
    const now = new Date();
    const localNow = toZonedTime(now, timezone);
    const startDate = fromZonedTime(startOfWeek(localNow, { weekStartsOn: 1 }), timezone);
    return this.getExpensesSummary(startDate, now);
  }

  /**
   * Báo cáo tháng này
   */
  async getMonthReport(timezone = 'Asia/Bangkok'): Promise<ReportSummaryResult> {
    const now = new Date();
    const startDate = fromZonedTime(startOfMonth(toZonedTime(now, timezone)), timezone);
    return this.getExpensesSummary(startDate, now);
  }

  /**
   * Báo cáo năm nay
   */
  async getYearReport(timezone = 'Asia/Bangkok'): Promise<ReportSummaryResult> {
    const now = new Date();
    const startDate = fromZonedTime(startOfYear(toZonedTime(now, timezone)), timezone);
    return this.getExpensesSummary(startDate, now);
  }

  /**
   * Định dạng tin nhắn báo cáo Telegram
   */
  formatReportMessage(title: string, summary: ReportSummaryResult): string {
    const totalFormatted = summary.totalUsd.toFixed(2);

    if (summary.transactionCount === 0) {
      return `📊 **${title}**\n\nChưa có chi tiêu nào được xác nhận trong khoảng thời gian này.`;
    }

    const categoryIcons: Record<string, string> = {
      Food: '🍜',
      Transport: '🚗',
      Shopping: '🛒',
      Entertainment: '🎬',
      Health: '💊',
      Bills: '💡',
    };

    let details = '';
    for (const cat of summary.categories) {
      const icon = categoryIcons[cat.categoryName] || '📂';
      details += `• ${icon} **${cat.categoryName}**: $${cat.usdAmount.toFixed(2)} (${cat.percentage}%)\n`;
    }

    return (
      `📊 **${title} (Ví chung gia đình)**\n\n` +
      `💵 **Tổng chi tiêu:** \`$${totalFormatted} USD\`\n` +
      `📦 **Tổng số giao dịch:** ${summary.transactionCount}\n\n` +
      `📂 **Chi tiết theo nhóm danh mục:**\n` +
      details
    );
  }
}

export const reportService = new ReportService();
