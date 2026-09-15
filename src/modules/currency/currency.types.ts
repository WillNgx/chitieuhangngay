import { Prisma } from '@prisma/client';

export interface ExchangeRateResult {
  baseCurrency: string;
  targetCurrency: string;
  rate: Prisma.Decimal;
  date: Date;
  provider: string;
}

export interface ICurrencyProvider {
  name: string;
  getRate(from: string, to: string, timestamp: Date): Promise<ExchangeRateResult | null>;
}
