import { Prisma } from '@prisma/client';

export type DecimalInstance = Prisma.Decimal;

export function toDecimal(value: string | number | Prisma.Decimal): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  return new Prisma.Decimal(value);
}

export function formatCurrency(amount: Prisma.Decimal | number | string, currency: string): string {
  const dec = toDecimal(amount);
  return `${dec.toFixed(2)} ${currency.toUpperCase()}`;
}
