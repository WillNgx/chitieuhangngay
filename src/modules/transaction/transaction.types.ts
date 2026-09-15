import { Prisma, TransactionSource, TransactionStatus } from '@prisma/client';

export interface CreateTransactionInput {
  userId: string;
  amount: Prisma.Decimal;
  currency: string;
  categoryName?: string | null;
  subcategoryName?: string | null;
  merchant?: string | null;
  description?: string | null;
  purpose?: string | null;
  source?: TransactionSource;
  aiConfidence?: number | null;
  transactionAt?: Date;
  status?: TransactionStatus;
}

export interface TransactionSummaryItem {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  usdAmount: Prisma.Decimal;
  categoryName: string;
  description: string | null;
  merchant: string | null;
  purpose: string | null;
  transactionAt: Date;
  userName?: string | null;
}
