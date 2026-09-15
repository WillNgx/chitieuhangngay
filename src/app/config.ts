import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, 'TELEGRAM_WEBHOOK_SECRET is required'),

  BOT_ACCESS_PASSWORD: z.string().min(1, 'BOT_ACCESS_PASSWORD is required').default('mw1624'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),

  EXCHANGE_RATE_API_URL: z.string().url().default('https://api.frankfurter.app'),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  SUPABASE_BUCKET_RECEIPTS: z.string().default('receipts'),
});

const parsed = configSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && (!value.SUPABASE_URL || !value.SUPABASE_SERVICE_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SUPABASE_URL'],
      message: 'Supabase Storage configuration is required in production',
    });
  }
  if (value.NODE_ENV === 'production' && value.BOT_ACCESS_PASSWORD === 'mw1624') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BOT_ACCESS_PASSWORD'],
      message: 'Change the default access password in production',
    });
  }
}).safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Config = z.infer<typeof configSchema>;
