import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.js';
import { logger } from '../../shared/logger/index.js';
import { ExchangeRateResult, ICurrencyProvider } from './currency.types.js';
import { FrankfurterProvider } from './providers/frankfurter.provider.js';
import { OpenErProvider } from './providers/open-er.provider.js';

export class CurrencyService {
  private providers: ICurrencyProvider[];
  private cache = new Map<string, { result: ExchangeRateResult; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 giờ cache

  constructor() {
    this.providers = [new FrankfurterProvider(), new OpenErProvider()];
  }

  private getCacheKey(from: string, to: string, dateStr: string): string {
    return `${from.toUpperCase()}_${to.toUpperCase()}_${dateStr}`;
  }

  /**
   * Lấy tỷ giá quy đổi từ currency gốc sang USD tại thời điểm nhận tin nhắn
   */
  async getExchangeRate(
    fromCurrency: string,
    targetCurrency = 'USD',
    timestamp: Date = new Date(),
  ): Promise<ExchangeRateResult> {
    const from = fromCurrency.toUpperCase();
    const to = targetCurrency.toUpperCase();

    if (from === to) {
      return {
        baseCurrency: from,
        targetCurrency: to,
        rate: new Prisma.Decimal(1),
        date: timestamp,
        provider: 'fixed',
      };
    }

    const dateStr = timestamp.toISOString().split('T')[0];
    const cacheKey = this.getCacheKey(from, to, dateStr);

    // 1. Kiểm tra memory cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.result,
        date: timestamp,
      };
    }

    // 2. Thử từng provider
    for (const provider of this.providers) {
      try {
        const rateResult = await provider.getRate(from, to, timestamp);
        if (rateResult && !rateResult.rate.isZero()) {
          // Lưu vào memory cache
          this.cache.set(cacheKey, {
            result: rateResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });

          // Lưu snapshot vào database exchange_rates (không bắt buộc await để không block)
          this.persistRateToDb(rateResult, timestamp).catch((err) => {
            logger.warn({ err }, 'Không thể lưu rate vào DB exchange_rates');
          });

          return {
            ...rateResult,
            date: timestamp,
          };
        }
      } catch (err) {
        logger.warn({ provider: provider.name, error: err }, 'Provider gặp lỗi khi lấy tỷ giá');
      }
    }

    // 3. Fallback: tìm trong DB bản ghi gần nhất
    try {
      const dbRate = await prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: from,
          targetCurrency: to,
          rateDate: { lte: new Date(`${dateStr}T23:59:59.999Z`) },
        },
        orderBy: { rateDate: 'desc' },
      });

      if (dbRate) {
        logger.info(
          { from, to, rate: dbRate.rate.toString() },
          'Dùng tỷ giá lưu trữ trước đó từ DB',
        );
        return {
          baseCurrency: from,
          targetCurrency: to,
          rate: dbRate.rate,
          date: timestamp,
          provider: 'db-fallback',
        };
      }
    } catch (e) {
      logger.warn({ e }, 'Không truy vấn được DB exchange_rates');
    }

    throw new Error(`Không thể lấy tỷ giá ${from}/${to} tại ${dateStr}`);
  }

  private async persistRateToDb(rateResult: ExchangeRateResult, date: Date) {
    const rateDate = new Date(date.toISOString().split('T')[0]);
    await prisma.exchangeRate.upsert({
      where: {
        baseCurrency_targetCurrency_rateDate_provider: {
          baseCurrency: rateResult.baseCurrency,
          targetCurrency: rateResult.targetCurrency,
          rateDate,
          provider: rateResult.provider,
        },
      },
      create: {
        baseCurrency: rateResult.baseCurrency,
        targetCurrency: rateResult.targetCurrency,
        rate: rateResult.rate,
        rateDate,
        provider: rateResult.provider,
      },
      update: {
        rate: rateResult.rate,
      },
    });
  }
}

export const currencyService = new CurrencyService();
