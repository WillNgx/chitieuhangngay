import { z } from 'zod';

// 1 khoản chi trong tin nhắn text (1 tin có thể có nhiều khoản, mỗi dòng 1 khoản)
export const ExpenseItemSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Amount phải là chuỗi số hợp lệ'),
  currency: z.string().min(2).max(10).toUpperCase(),
  merchant: z.string().nullable().optional(),
  category: z.string().min(1),
  subcategory: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  description: z.string().min(1),
});

export type ExpenseItem = z.infer<typeof ExpenseItemSchema>;

// Khung output thô của ExpenseParser: từng khoản được validate riêng bằng ExpenseItemSchema
// để 1 khoản sai không làm hỏng cả tin nhắn
export const ExpenseParserRawOutputSchema = z.object({
  expenses: z.array(z.unknown()),
  ignored: z.array(z.string()).nullable().optional(),
});

export interface ExpenseParserOutput {
  expenses: ExpenseItem[];
  // Các dòng AI không nhận ra là khoản chi
  ignored: string[];
  // Số khoản AI trả về nhưng sai schema (bị loại)
  invalidCount: number;
}

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
