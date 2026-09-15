import { z } from 'zod';

export const ExpenseParserOutputSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount phải là chuỗi số hợp lệ'),
  currency: z.string().min(2).max(10).toUpperCase(),
  merchant: z.string().nullable().optional(),
  category: z.string().min(1),
  subcategory: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1),
});

export type ExpenseParserOutput = z.infer<typeof ExpenseParserOutputSchema>;

export const ReceiptExtractorOutputSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount phải là chuỗi số hợp lệ'),
  currency: z.string().min(2).max(10).toUpperCase(),
  merchant: z.string().nullable().optional(),
  category: z.string().min(1),
  subcategory: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1),
  rawOcrText: z.string().optional(),
});

export type ReceiptExtractorOutput = z.infer<typeof ReceiptExtractorOutputSchema>;

export const QueryInterpreterOutputSchema = z.object({
  timeframe: z.enum(['week', 'month', 'year', 'all']),
  category: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type QueryInterpreterOutput = z.infer<typeof QueryInterpreterOutputSchema>;
