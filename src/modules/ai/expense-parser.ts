import { GoogleGenAI } from '@google/genai';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';
import { ExpenseParserOutput, ExpenseParserOutputSchema } from './ai.types.js';
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

Quy tắc quan trọng:
1. amount: Chỉ gồm số (dạng chuỗi, vd: "250", "45000", "12.5"). Nếu người dùng viết tắt "k", "cành", "lít" trong tiếng Việt (vd: 50k -> 50000, 120k -> 120000).
2. currency: Mã tiền tệ ISO 3 chữ cái chuẩn (USD, VND, THB, EUR, JPY, SGD, v.v.). Mặc định nếu người dùng không nói rõ tiền tệ: nếu số tiền >= 1000 hoặc dùng tiếng Việt -> VND; nếu có ký hiệu $ -> USD; nếu ở Thái hoặc có THB/baht -> THB.
3. merchant: Tên cửa hàng, quán ăn, thương hiệu (nếu có đề cập, vd: "Grab", "Starbucks", "7-Eleven").
4. category: Một trong các Category chính (Food, Transport, Shopping, Entertainment, Health, Bills).
5. subcategory: Subcategory tương ứng nếu xác định được.
6. purpose: Mục đích chi tiêu (vd: "Ăn sáng", "Đi làm", "Tiệc sinh nhật", "Mua sắm cá nhân").
7. confidence: Độ tin cậy của bạn từ 0.0 đến 1.0.
8. description: Bản tóm tắt ngắn gọn mô tả giao dịch.

Bắt buộc trả về đúng cấu trúc JSON, không kèm bất kỳ giải thích hay markdown backticks nào ngoài JSON.
`;

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
                text: `${SYSTEM_PROMPT}\n\nTin nhắn chi tiêu của người dùng: "${text}"`,
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

      // Validate bằng Zod Schema
      const validationResult = ExpenseParserOutputSchema.safeParse(parseJsonSafely(responseText));

      if (!validationResult.success) {
        logger.warn(
          { errors: validationResult.error.format(), raw: responseText, retryCount },
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

      return validationResult.data;
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
