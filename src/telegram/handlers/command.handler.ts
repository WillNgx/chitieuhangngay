import { Composer } from 'grammy';
import { logger } from '../../shared/logger/index.js';
import { reportService } from '../../modules/analytics/report.service.js';
import { transactionService } from '../../modules/transaction/transaction.service.js';
import { formatTransactionPreview } from '../utils/preview-formatter.js';
import { createEditFieldKeyboard } from '../keyboards/transaction.keyboard.js';
import { authService } from '../../modules/auth/auth.service.js';

export const commandComposer = new Composer();

commandComposer.command('start', async (ctx) => {
  await ctx.reply(
    '👋 Chào bạn! Tôi là bot ghi nhận chi tiêu gia đình (AI-powered).\n\n' +
      'Các tính năng chính:\n' +
      '• Nhập chi tiêu bằng tin nhắn text (vd: "Ăn trưa 120k", "Grab 75 THB")\n' +
      '• Gửi ảnh hoá đơn để AI tự động đọc và trích xuất\n' +
      '• Báo cáo tổng hợp chi tiêu USD: /week, /month, /year\n' +
      '• Chỉnh sửa & Xoá: /edit <id>, /delete <id>\n' +
      '• Hướng dẫn chi tiết: /help',
  );
});

commandComposer.command('help', async (ctx) => {
  await ctx.reply(
    '📖 **Hướng dẫn sử dụng Expense Tracker Bot:**\n\n' +
      '1️⃣ **Ghi nhận chi tiêu:**\n' +
      '• Nhắn tin: "Cà phê 45k" hoặc "Dinner 350 THB with friends"\n' +
      '• Gửi ảnh hoá đơn (kèm hoặc không kèm text mô tả)\n' +
      '• Mọi giao dịch sẽ hiện bản xem trước kèm 3 nút: [✅ Xác nhận] [✏️ Sửa] [❌ Huỷ]\n\n' +
      '2️⃣ **Báo cáo chi tiêu (quy đổi USD):**\n' +
      '• /week - Thống kê chi tiêu tuần này (tính trên toàn bộ ví chung)\n' +
      '• /month - Thống kê chi tiêu tháng này\n' +
      '• /year - Thống kê chi tiêu năm nay\n\n' +
      '3️⃣ **Chỉnh sửa & Xoá:**\n' +
      '• /edit <id> - Chỉnh sửa giao dịch đã xác nhận\n' +
      '• /delete <id> - Xoá giao dịch đã xác nhận',
    { parse_mode: 'Markdown' },
  );
});

commandComposer.command('week', async (ctx) => {
  try {
    const user = await authService.getUserByTelegramId(ctx.from?.id.toString() || '');
    const summary = await reportService.getWeekReport(user?.timezone);
    const message = reportService.formatReportMessage('Báo cáo Tuần này', summary);
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error({ error }, 'Lỗi tạo báo cáo /week');
    await ctx.reply('⚠️ Không thể tải báo cáo tuần này. Vui lòng thử lại sau.');
  }
});

commandComposer.command('month', async (ctx) => {
  try {
    const user = await authService.getUserByTelegramId(ctx.from?.id.toString() || '');
    const summary = await reportService.getMonthReport(user?.timezone);
    const message = reportService.formatReportMessage('Báo cáo Tháng này', summary);
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error({ error }, 'Lỗi tạo báo cáo /month');
    await ctx.reply('⚠️ Không thể tải báo cáo tháng này. Vui lòng thử lại sau.');
  }
});

commandComposer.command('year', async (ctx) => {
  try {
    const user = await authService.getUserByTelegramId(ctx.from?.id.toString() || '');
    const summary = await reportService.getYearReport(user?.timezone);
    const message = reportService.formatReportMessage('Báo cáo Năm nay', summary);
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error({ error }, 'Lỗi tạo báo cáo /year');
    await ctx.reply('⚠️ Không thể tải báo cáo năm nay. Vui lòng thử lại sau.');
  }
});

commandComposer.command('edit', async (ctx) => {
  const txId = ctx.match?.trim();
  if (!txId) {
    await ctx.reply(
      'ℹ️ Vui lòng cung cấp mã giao dịch cần sửa:\nVí dụ: `/edit 123e4567-e89b-12d3-a456-426614174000`',
      {
        parse_mode: 'Markdown',
      },
    );
    return;
  }

  try {
    const tx = await transactionService.getTransactionById(txId);
    if (!tx) {
      await ctx.reply(`⚠️ Không tìm thấy giao dịch có mã \`${txId}\`.`, { parse_mode: 'Markdown' });
      return;
    }

    const preview = formatTransactionPreview(tx);
    await ctx.reply(`✏️ **Chỉnh sửa giao dịch**\n\n${preview}\n\nChọn trường bạn muốn chỉnh sửa:`, {
      parse_mode: 'Markdown',
      reply_markup: createEditFieldKeyboard(tx.id),
    });
  } catch (error) {
    logger.error({ error, txId }, 'Lỗi khi mở giao dịch để sửa');
    await ctx.reply('⚠️ Đã xảy ra lỗi khi tìm kiếm giao dịch để chỉnh sửa.');
  }
});

commandComposer.command('delete', async (ctx) => {
  const txId = ctx.match?.trim();
  if (!txId) {
    await ctx.reply(
      'ℹ️ Vui lòng cung cấp mã giao dịch cần xoá:\nVí dụ: `/delete 123e4567-e89b-12d3-a456-426614174000`',
      {
        parse_mode: 'Markdown',
      },
    );
    return;
  }

  try {
    const tx = await transactionService.getTransactionById(txId);
    if (!tx) {
      await ctx.reply(`⚠️ Không tìm thấy giao dịch có mã \`${txId}\`.`, { parse_mode: 'Markdown' });
      return;
    }

    await transactionService.deleteTransaction(txId);
    await ctx.reply(
      `🗑️ **Đã xoá giao dịch thành công!**\n\n` +
        `• Mã: \`${txId}\`\n` +
        `• Số tiền: ${tx.amount.toString()} ${tx.currency} (≈ $${tx.usdAmount.toFixed(2)} USD)\n` +
        `• Mô tả: ${tx.description || 'Không có'}`,
      { parse_mode: 'Markdown' },
    );
  } catch (error) {
    logger.error({ error, txId }, 'Lỗi khi xoá giao dịch');
    await ctx.reply('⚠️ Đã xảy ra lỗi khi xoá giao dịch.');
  }
});
