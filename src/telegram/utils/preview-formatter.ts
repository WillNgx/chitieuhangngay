import { Prisma } from '@prisma/client';

interface TransactionPreviewData {
  id: string;
  merchant?: string | null;
  amount: Prisma.Decimal;
  currency: string;
  usdAmount: Prisma.Decimal;
  category?: {
    name: string;
    parent?: { name: string } | null;
  } | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  purpose?: string | null;
  description?: string | null;
}

function formatCategory(tx: TransactionPreviewData): string {
  if (tx.category) {
    return tx.category.parent
      ? `📂 ${tx.category.parent.name} → ${tx.category.name}`
      : `📂 ${tx.category.name}`;
  }
  if (tx.categoryName) {
    return tx.subcategoryName
      ? `📂 ${tx.categoryName} → ${tx.subcategoryName}`
      : `📂 ${tx.categoryName}`;
  }
  return '📂 Khác';
}

export function formatTransactionPreview(tx: TransactionPreviewData): string {
  const merchantPart = tx.merchant ? `🏪 ${tx.merchant} · ` : '';
  const originalAmountPart = `💰 ${tx.amount.toString()} ${tx.currency}`;
  const usdAmountPart = `💵 ≈ $${tx.usdAmount.toFixed(2)}`;
  const categoryPart = formatCategory(tx);
  const purposePart = tx.purpose ? ` · 🎯 ${tx.purpose}` : '';
  const descPart = tx.description ? `\n📝 ${tx.description}` : '';

  return `${merchantPart}${originalAmountPart} · ${usdAmountPart}\n${categoryPart}${purposePart}${descPart}`;
}

/**
 * Xem trước tin nhắn nhiều khoản: mỗi khoản 1 dòng + tổng USD (cộng bằng Decimal)
 */
export function formatBatchPreview(txs: TransactionPreviewData[]): string {
  const lines = txs.map((tx, index) => {
    const name = tx.description || tx.merchant || 'Khoản chi';
    return `${index + 1}. ${name} · 💰 ${tx.amount.toString()} ${tx.currency} ≈ $${tx.usdAmount.toFixed(2)} · ${formatCategory(tx)}`;
  });
  const totalUsd = txs.reduce((sum, tx) => sum.add(tx.usdAmount), new Prisma.Decimal(0));

  return `📋 ${txs.length} khoản chi:\n${lines.join('\n')}\n\n💵 Tổng ≈ $${totalUsd.toFixed(2)}`;
}
