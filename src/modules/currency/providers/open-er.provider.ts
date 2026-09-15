import { ofetch } from 'ofetch';
import { Prisma } from '@prisma/client';
import { logger } from '../../../shared/logger/index.js';
import { ExchangeRateResult, ICurrencyProvider } from '../currency.types.js';

interface OpenErApiResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc: string;
}

export class OpenErProvider implements ICurrencyProvider {
  name = 'open-er-api';

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
      if (timestamp.toISOString().split('T')[0] !== new Date().toISOString().split('T')[0]) {
        return null;
      }
      const url = `https://open.er-api.com/v6/latest/${base}`;
      const data = await ofetch<OpenErApiResponse>(url, { timeout: 4000 });

      if (data?.rates?.[target]) {
        return {
          baseCurrency: base,
          targetCurrency: target,
          rate: new Prisma.Decimal(String(data.rates[target])),
          date: new Date(data.time_last_update_utc || Date.now()),
          provider: this.name,
        };
      }
      return null;
    } catch (error) {
      logger.warn({ from, to, error }, 'Open ER API không lấy được tỷ giá');
      return null;
    }
  }
}
