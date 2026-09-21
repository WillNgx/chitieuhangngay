import { GoogleGenAI } from '@google/genai';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';
import {
  ExpenseItem,
  ExpenseItemSchema,
  ExpenseParserOutput,
  ExpenseParserRawOutputSchema,
} from './ai.types.js';
import {
  GEMINI_RETRY_DELAY_MS,
  delay,
  isRetryableGeminiError,
  parseJsonSafely,
} from './gemini-helpers.js';

const SYSTEM_PROMPT = `
Bạn là AI chuyên gia phân tích chi tiêu gia đình. Nhiệm vụ của bạn là nhận tin nhắn mô tả chi tiêu của người dùng và trích xuất thành định dạng JSON chuẩn xác.

Danh mục chuẩn (Taxonomy):
- Food: Restaurant, Fast Food, Coffee, Groceries, Delivery, 7-Eleven
- Transport: Grab, Taxi, Bus, Train, Fuel, Parking
- Shopping: Clothes, Electronics, Games, Household, Other
- Entertainment: Movie, Game, Subscription, Event
- Health: Medicine, Hospital, Fitness
- Bills: Internet, Phone, Electricity, Other

Tin nhắn có thể chứa NHIỀU khoản chi: thường mỗi dòng là 1 khoản, một dòng cũng có thể liệt kê nhiều khoản (vd: "mỳ 40, nước 20"). Trích xuất TỪNG khoản thành 1 phần tử riêng trong mảng "expenses", giữ đúng thứ tự trong tin nhắn.

Quy tắc quan trọng cho mỗi khoản:
1. amount: Chỉ gồm số (dạng chuỗi, vd: "250", "45000", "12.5"). Nếu người dùng viết tắt "k", "cành", "lít" trong tiếng Việt (vd: 50k -> 50000, 120k -> 120000).
2. currency: Mã tiền tệ ISO 3 chữ cái chuẩn (USD, VND, THB, EUR, JPY, SGD, v.v.). Nếu khoản không ghi tiền tệ nhưng các khoản khác trong cùng tin nhắn có ghi -> dùng tiền tệ đó. Mặc định nếu cả tin nhắn không nói rõ tiền tệ: nếu số tiền >= 1000 hoặc dùng tiếng Việt -> VND; nếu có ký hiệu $ -> USD; nếu ở Thái hoặc có THB/baht/bath -> THB.
3. merchant: Tên cửa hàng, quán ăn, thương hiệu (nếu có đề cập, vd: "Grab", "Starbucks", "7-Eleven").
4. category: Một trong các Category chính (Food, Transport, Shopping, Entertainment, Health, Bills).
5. subcategory: Subcategory tương ứng nếu xác định được.
6. purpose: Mục đích chi tiêu (vd: "Ăn sáng", "Đi làm", "Tiệc sinh nhật", "Mua sắm cá nhân").
7. confidence: Độ tin cậy của bạn từ 0.0 đến 1.0.
8. description: Tên ngắn gọn của khoản chi, KHÔNG kèm số tiền hay tiền tệ (vd: "Mỳ thuyền", "Grab đi làm").

Dòng nào không phải khoản chi (không có số tiền) thì đưa nguyên văn dòng đó vào mảng "ignored".

Bắt buộc trả về đúng 1 JSON object theo cấu trúc sau (kể cả khi chỉ có 1 khoản), không kèm bất kỳ giải thích hay markdown backticks nào ngoài JSON:
{"expenses": [{"amount": "40", "currency": "THB", "merchant": null, "category": "Food", "subcategory": "Restaurant", "purpose": "Ăn trưa", "confidence": 0.9, "description": "Mỳ thuyền"}], "ignored": []}
`;

/**
 * Model lite đôi khi trả thẳng mảng khoản chi, hoặc 1 object khoản chi,
 * thay vì { expenses: [...] } -> đưa về đúng khung trước khi validate
 */
export function normalizeExpenseParserOutput(json: unknown): unknown {
  if (Array.isArray(json)) {
    return { expenses: json };
  }
  if (json && typeof json === 'object' && !('expenses' in json) && 'amount' in json) {
    return { expenses: [json] };
  }
  return json;
}

export class ExpenseParser {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async parse(text: string, retryCount = 0): Promise<ExpenseParserOutput> {
    try {
      const response = await this.ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\nTin nhắn chi tiêu của người dùng:\n"""\n${text}\n"""`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: env.GEMINI_THINKING_LEVEL },
        },
      });

      const responseText = response.text?.trim() || '{}';

      // Validate khung output, sau đó validate riêng từng khoản bằng Zod Schema
      const rawResult = ExpenseParserRawOutputSchema.safeParse(
        normalizeExpenseParserOutput(parseJsonSafely(responseText)),
      );

      if (rawResult.success && rawResult.data.expenses.length === 0) {
        // AI khẳng định tin nhắn không có khoản chi nào -> không cần gọi lại
        throw new Error(
          `Không tìm thấy khoản chi nào trong tin nhắn: "${text}". Vui lòng nhập rõ hơn (vd: "Ăn tối 250 THB").`,
        );
      }

      const expenses: ExpenseItem[] = [];
      let invalidCount = 0;
      for (const item of rawResult.success ? rawResult.data.expenses : []) {
        const itemResult = ExpenseItemSchema.safeParse(item);
        if (itemResult.success) {
          expenses.push(itemResult.data);
        } else {
          invalidCount++;
        }
      }

      if (expenses.length === 0) {
        logger.warn(
          {
            errors: rawResult.success ? undefined : rawResult.error.format(),
            raw: responseText,
            retryCount,
          },
          'Zod validation thất bại cho ExpenseParser',
        );

        if (retryCount < 1) {
          logger.info('Thử lại ExpenseParser lần 2...');
          return this.parse(text, retryCount + 1);
        }

        throw new Error(
          `Không thể phân tích dữ liệu chi tiêu hợp lệ từ tin nhắn: "${text}". Vui lòng nhập rõ hơn (vd: "Ăn tối 250 THB").`,
        );
      }

      return {
        expenses,
        ignored: rawResult.success ? (rawResult.data.ignored ?? []) : [],
        invalidCount,
      };
    } catch (error) {
      // Chỉ gọi lại khi lỗi tạm thời (429/503/timeout), chờ một chút để tránh dính lỗi lần nữa
      if (retryCount < 1 && isRetryableGeminiError(error)) {
        logger.warn({ error, retryCount }, 'Gemini quá tải/timeout, chờ rồi thử lại lần 2...');
        await delay(GEMINI_RETRY_DELAY_MS);
        return this.parse(text, retryCount + 1);
      }
      logger.error({ error, text }, 'Thất bại khi phân tích text chi tiêu');
      throw error;
    }
  }
}

export const expenseParser = new ExpenseParser();
