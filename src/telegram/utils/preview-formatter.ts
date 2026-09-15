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

export function formatTransactionPreview(tx: TransactionPreviewData): string {
  const merchantPart = tx.merchant ? `🏪 ${tx.merchant} · ` : '';
  const originalAmountPart = `💰 ${tx.amount.toString()} ${tx.currency}`;
  const usdAmountPart = `💵 ≈ $${tx.usdAmount.toFixed(2)}`;

  let categoryPart = '';
  if (tx.category) {
    if (tx.category.parent) {
      categoryPart = `📂 ${tx.category.parent.name} → ${tx.category.name}`;
    } else {
      categoryPart = `📂 ${tx.category.name}`;
    }
  } else if (tx.categoryName) {
    categoryPart = tx.subcategoryName
      ? `📂 ${tx.categoryName} → ${tx.subcategoryName}`
      : `📂 ${tx.categoryName}`;
  } else {
    categoryPart = '📂 Khác';
  }

  const purposePart = tx.purpose ? ` · 🎯 ${tx.purpose}` : '';
  const descPart = tx.description ? `\n📝 ${tx.description}` : '';

  return `${merchantPart}${originalAmountPart} · ${usdAmountPart}\n${categoryPart}${purposePart}${descPart}`;
}
