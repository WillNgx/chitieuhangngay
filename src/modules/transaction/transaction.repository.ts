import { Prisma, TransactionStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';

export class TransactionRepository {
  async create(data: Prisma.TransactionCreateInput) {
    return prisma.transaction.create({
      data,
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        user: true,
      },
    });
  }

  async findById(id: string) {
    return prisma.transaction.findUnique({
      where: { id },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        user: true,
        receipts: true,
      },
    });
  }

  async updateStatus(id: string, status: TransactionStatus) {
    return prisma.transaction.update({
      where: { id },
      data: { status },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        user: true,
      },
    });
  }

  // Các giao dịch của cùng 1 tin nhắn nhiều khoản: cùng người tạo + cùng thời điểm nhận tin
  async findPendingBatch(userId: string, transactionAt: Date) {
    return prisma.transaction.findMany({
      where: { userId, transactionAt, status: 'pending_confirm' },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Giao dịch chờ xác nhận không được đụng tới (tạo/sửa) kể từ mốc cutoff
  async findPendingUpdatedBefore(cutoff: Date) {
    return prisma.transaction.findMany({
      where: { status: 'pending_confirm', updatedAt: { lte: cutoff } },
      select: { userId: true, transactionAt: true },
    });
  }

  async updateStatusMany(ids: string[], status: TransactionStatus) {
    return prisma.transaction.updateMany({
      where: { id: { in: ids }, status: 'pending_confirm' },
      data: { status },
    });
  }

  async update(id: string, data: Prisma.TransactionUpdateInput) {
    return prisma.transaction.update({
      where: { id },
      data,
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        user: true,
      },
    });
  }

  async delete(id: string) {
    return prisma.transaction.delete({
      where: { id },
    });
  }

  async findOrCreateCategory(categoryName: string, subcategoryName?: string | null) {
    // 1. Tìm hoặc tạo category cha
    let parent = await prisma.category.findFirst({
      where: { name: { equals: categoryName, mode: 'insensitive' }, parentId: null },
    });

    if (!parent) {
      parent = await prisma.category.create({
        data: { name: categoryName, type: 'expense' },
      });
    }

    // 2. Nếu có subcategory
    if (subcategoryName) {
      let sub = await prisma.category.findFirst({
        where: {
          name: { equals: subcategoryName, mode: 'insensitive' },
          parentId: parent.id,
        },
      });

      if (!sub) {
        sub = await prisma.category.create({
          data: {
            name: subcategoryName,
            parentId: parent.id,
            type: 'expense',
          },
        });
      }
      return sub;
    }

    return parent;
  }
}

export const transactionRepository = new TransactionRepository();
