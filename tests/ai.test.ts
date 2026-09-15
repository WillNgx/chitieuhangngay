import { describe, it, expect } from 'vitest';
import {
  ExpenseParserOutputSchema,
  ReceiptExtractorOutputSchema,
  QueryInterpreterOutputSchema,
} from '../src/modules/ai/ai.types.js';

describe('AI Zod Schemas (Phase 3)', () => {
  describe('ExpenseParserOutputSchema', () => {
    it('validate thành công khi dữ liệu hợp lệ', () => {
      const validData = {
        amount: '250',
        currency: 'THB',
        merchant: 'ABC Restaurant',
        category: 'Food',
        subcategory: 'Restaurant',
        purpose: 'Ăn tối cùng bạn bè',
        confidence: 0.95,
        description: 'Bữa tối tại ABC Restaurant',
      };

      const result = ExpenseParserOutputSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('báo lỗi nếu amount không phải là chuỗi số', () => {
      const invalidData = {
        amount: 'abc',
        currency: 'THB',
        category: 'Food',
        confidence: 0.9,
        description: 'Test',
      };

      const result = ExpenseParserOutputSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('báo lỗi nếu currency quá ngắn', () => {
      const invalidData = {
        amount: '100',
        currency: 'U',
        category: 'Food',
        confidence: 0.9,
        description: 'Test',
      };

      const result = ExpenseParserOutputSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('ReceiptExtractorOutputSchema', () => {
    it('validate thành công output trích xuất hoá đơn', () => {
      const validReceipt = {
        amount: '1250.50',
        currency: 'VND',
        merchant: 'WinMart',
        category: 'Food',
        subcategory: 'Groceries',
        purpose: 'Mua sắm thực phẩm',
        confidence: 0.98,
        description: 'Hoá đơn mua hàng WinMart',
        rawOcrText: 'WinMart - Tong cong: 1250.50 VND',
      };

      const result = ReceiptExtractorOutputSchema.safeParse(validReceipt);
      expect(result.success).toBe(true);
    });
  });

  describe('QueryInterpreterOutputSchema', () => {
    it('validate đúng timeframe', () => {
      const validQuery = {
        timeframe: 'week',
        category: 'Food',
      };

      const result = QueryInterpreterOutputSchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });
  });
});
