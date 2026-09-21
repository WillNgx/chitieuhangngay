import { Prisma } from '@prisma/client';
import { currencyService } from '../currency/currency.service.js';
import { transactionRepository } from './transaction.repository.js';
import { CreateTransactionInput } from './transaction.types.js';
import { logger } from '../../shared/logger/index.js';

export class TransactionService {
  /**
   * Tạo giao dịch mới với trạng thái pending_confirm và snapshot tỷ giá USD
   */
  async createPendingTransaction(input: CreateTransactionInput) {
    const transactionAt = input.transactionAt || new Date();
    const currency = input.currency.toUpperCase();

    // 1. Lấy tỷ giá tại thời điểm nhận tin nhắn
    const rateResult = await currencyService.getExchangeRate(currency, 'USD', transactionAt);

    // 2. Tính toán usd_amount bằng Decimal: usd_amount = amount * rate
    // Chú ý: Tiền luôn dùng Decimal, không bao giờ dùng number/float
    const usdAmount = input.amount.mul(rateResult.rate);

    // 3. Tìm hoặc tạo category phù hợp
    let categoryId: string | undefined;
    if (input.categoryName) {
      const category = await transactionRepository.findOrCreateCategory(
        input.categoryName,
        input.subcategoryName,
      );
      categoryId = category.id;
    }

    // 4. Tạo record transaction trong DB
    const transaction = await transactionRepository.create({
      user: { connect: { id: input.userId } },
      amount: input.amount,
      currency,
      usdAmount,
      exchangeRate: rateResult.rate,
      exchangeRateAt: rateResult.date,
      category: categoryId ? { connect: { id: categoryId } } : undefined,
      merchant: input.merchant,
      description: input.description,
      purpose: input.purpose,
      transactionAt,
      source: input.source || 'text',
      aiConfidence: input.aiConfidence ? new Prisma.Decimal(input.aiConfidence) : null,
      status: input.status || 'pending_confirm',
    });

    logger.info(
      {
        transactionId: transaction.id,
        amount: input.amount.toString(),
        currency,
        usdAmount: usdAmount.toString(),
        rate: rateResult.rate.toString(),
      },
      'Đã tạo giao dịch pending_confirm',
    );

    return transaction;
  }

  /**
   * Xác nhận giao dịch: chuyển status sang confirmed
   */
  async confirmTransaction(id: string) {
    const existing = await transactionRepository.findById(id);
    if (!existing) throw new Error(`Không tìm thấy giao dịch ID ${id}`);
    if (existing.status !== 'pending_confirm') {
      throw new Error('Chỉ giao dịch đang chờ xác nhận mới có thể được xác nhận');
    }
    const transaction = await transactionRepository.updateStatus(id, 'confirmed');
    logger.info({ transactionId: id }, 'Giao dịch đã được xác nhận (confirmed)');
    return transaction;
  }

  /**
   * Huỷ giao dịch: chuyển status sang rejected
   */
  async rejectTransaction(id: string) {
    const existing = await transactionRepository.findById(id);
    if (!existing) throw new Error(`Không tìm thấy giao dịch ID ${id}`);
    if (existing.status !== 'pending_confirm') {
      throw new Error('Chỉ giao dịch đang chờ xác nhận mới có thể được huỷ');
    }
    const transaction = await transactionRepository.updateStatus(id, 'rejected');
    logger.info({ transactionId: id }, 'Giao dịch đã bị từ chối/huỷ (rejected)');
    return transaction;
  }

  /**
   * Xác nhận cả nhóm giao dịch của 1 tin nhắn nhiều khoản
   */
  async confirmBatch(anchorId: string) {
    return this.setBatchStatus(anchorId, 'confirmed');
  }

  /**
   * Huỷ cả nhóm giao dịch của 1 tin nhắn nhiều khoản
   */
  async rejectBatch(anchorId: string) {
    return this.setBatchStatus(anchorId, 'rejected');
  }

  private async setBatchStatus(anchorId: string, status: 'confirmed' | 'rejected') {
    const anchor = await transactionRepository.findById(anchorId);
    if (!anchor) throw new Error(`Không tìm thấy giao dịch ID ${anchorId}`);

    const batch = await transactionRepository.findPendingBatch(anchor.userId, anchor.transactionAt);
    if (batch.length === 0) {
      throw new Error('Nhóm giao dịch này đã được xử lý trước đó');
    }

    await transactionRepository.updateStatusMany(
      batch.map((tx) => tx.id),
      status,
    );
    logger.info({ anchorId, count: batch.length, status }, 'Đã cập nhật trạng thái nhóm giao dịch');
    return batch;
  }

  /**
   * Sửa giao dịch đã có (đang chờ xác nhận hoặc đã xác nhận)
   */
  async updateTransaction(id: string, updates: Partial<CreateTransactionInput>) {
    const existing = await transactionRepository.findById(id);
    if (!existing) {
      throw new Error(`Không tìm thấy giao dịch ID ${id}`);
    }
    // Cho sửa cả giao dịch pending_confirm để nút "✏️ Sửa" trên bản xem trước dùng được
    if (existing.status === 'rejected') {
      throw new Error('Không thể sửa giao dịch đã bị huỷ');
    }

    let usdAmount = existing.usdAmount;
    let exchangeRate = existing.exchangeRate;

    // Nếu sửa amount hoặc currency, tính lại quy đổi
    if (updates.amount || updates.currency) {
      const newAmount = updates.amount || existing.amount;
      const newCurrency = (updates.currency || existing.currency).toUpperCase();
      const rateResult = await currencyService.getExchangeRate(
        newCurrency,
        'USD',
        existing.transactionAt,
      );
      exchangeRate = rateResult.rate;
      usdAmount = newAmount.mul(exchangeRate);
    }

    let categoryId = existing.categoryId;
    if (updates.categoryName) {
      const cat = await transactionRepository.findOrCreateCategory(
        updates.categoryName,
        updates.subcategoryName,
      );
      categoryId = cat.id;
    }

    return transactionRepository.update(id, {
      amount: updates.amount,
      currency: updates.currency?.toUpperCase(),
      usdAmount,
      exchangeRate,
      category: categoryId ? { connect: { id: categoryId } } : undefined,
      merchant: updates.merchant,
      description: updates.description,
      purpose: updates.purpose,
    });
  }

  /**
   * Xoá giao dịch
   */
  async deleteTransaction(id: string) {
    const existing = await transactionRepository.findById(id);
    if (!existing) throw new Error(`Không tìm thấy giao dịch ID ${id}`);
    if (existing.status !== 'confirmed') {
      throw new Error('Chỉ giao dịch đã xác nhận mới có thể được xoá');
    }
    return transactionRepository.delete(id);
  }

  async deletePendingTransaction(id: string) {
    const existing = await transactionRepository.findById(id);
    if (existing?.status === 'pending_confirm') {
      return transactionRepository.delete(id);
    }
  }

  /**
   * Tìm giao dịch theo ID
   */
  async getTransactionById(id: string) {
    return transactionRepository.findById(id);
  }
}

export const transactionService = new TransactionService();
