import { expenseParser } from './expense-parser.js';
import { receiptExtractor } from './receipt-extractor.js';
import { queryInterpreter } from './query-interpreter.js';
import { ExpenseParserOutput, ReceiptExtractorOutput, QueryInterpreterOutput } from './ai.types.js';

export class AIService {
  /**
   * Phân tích tin nhắn text mô tả chi tiêu
   */
  async parseExpenseText(text: string): Promise<ExpenseParserOutput> {
    return expenseParser.parse(text);
  }

  /**
   * Phân tích ảnh hoá đơn bằng Vision OCR
   */
  async extractReceipt(
    imageBuffer: Buffer,
    mimeType: string,
    caption?: string,
  ): Promise<ReceiptExtractorOutput> {
    return receiptExtractor.extract(imageBuffer, mimeType, caption);
  }

  /**
   * Diễn giải câu truy vấn thống kê
   */
  async interpretQuery(query: string): Promise<QueryInterpreterOutput> {
    return queryInterpreter.interpret(query);
  }
}

export const aiService = new AIService();
