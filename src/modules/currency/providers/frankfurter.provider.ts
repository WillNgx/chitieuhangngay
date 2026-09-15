import { ofetch } from 'ofetch';
import { Prisma } from '@prisma/client';
import { env } from '../../../app/config.js';
import { logger } from '../../../shared/logger/index.js';
import { ExchangeRateResult, ICurrencyProvider } from '../currency.types.js';

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export class FrankfurterProvider implements ICurrencyProvider {
  name = 'frankfurter';

  async getRate(from: string, to: string, timestamp: Date): Promise<ExchangeRateResult | null> {
    const base = from.toUpperCase();
    const target = to.toUpperCase();

    if (base === target) {
      return {
        baseCurrency: base,
        targetCurrency: target,
        rate: new Prisma.Decimal(1),
        date: new Date(),
        provider: this.name,
      };
    }

    try {
      const requestedDate = timestamp.toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      const endpoint = requestedDate === today ? 'latest' : requestedDate;
      const url = `${env.EXCHANGE_RATE_API_URL}/${endpoint}?from=${base}&to=${target}`;
      const data = await ofetch<FrankfurterResponse>(url, { timeout: 4000 });

      if (data?.rates?.[target]) {
        return {
          baseCurrency: base,
          targetCurrency: target,
          rate: new Prisma.Decimal(String(data.rates[target])),
          date: new Date(data.date),
          provider: this.name,
        };
      }
      return null;
    } catch (error) {
      logger.warn(
        { from, to, error },
        'Frankfurter API không phản hồi hoặc không hỗ trợ đồng tiền này',
      );
      return null;
    }
  }
}
