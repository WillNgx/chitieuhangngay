import { GoogleGenAI } from '@google/genai';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';
import { ReceiptExtractorOutput, ReceiptExtractorOutputSchema } from './ai.types.js';

const RECEIPT_SYSTEM_PROMPT = `
Bạn là chuyên gia OCR và phân tích hoá đơn/biên lai mua sắm bằng AI.
Nhiệm vụ: Phân tích ảnh hoá đơn được cung cấp, đọc thông tin thanh toán và trích xuất thành định dạng JSON.

Danh mục chuẩn (Taxonomy):
- Food: Restaurant, Fast Food, Coffee, Groceries, Delivery, 7-Eleven
- Transport: Grab, Taxi, Bus, Train, Fuel, Parking
- Shopping: Clothes, Electronics, Games, Household, Other
- Entertainment: Movie, Game, Subscription, Event
- Health: Medicine, Hospital, Fitness
- Bills: Internet, Phone, Electricity, Other

Quy tắc trích xuất:
1. amount: Tổng số tiền thanh toán cuối cùng (Total / Grand Total / Amount Due), chỉ chuỗi số (vd: "350.50", "150000").
2. currency: Mã tiền tệ chuẩn (USD, VND, THB, SGD...).
3. merchant: Tên cửa hàng, siêu thị, nhà hàng trên đầu hoá đơn.
4. category & subcategory: Phân loại theo danh mục chuẩn ở trên.
5. purpose: Mục đích chi tiêu dựa trên mặt hàng hoặc ghi chú của người dùng nếu có.
6. confidence: Đánh giá độ tin cậy từ 0.0 đến 1.0 (dựa trên độ sắc nét và tính rõ ràng của hoá đơn).
7. description: Tóm tắt ngắn gọn các mặt hàng chính hoặc tổng chi tiêu.
8. rawOcrText: Các dòng text chính đọc được trên hoá đơn.

Bắt buộc trả về đúng định dạng JSON, không kèm bất kỳ ký tự nào ngoài JSON.
`;

export class ReceiptExtractor {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async extract(
    imageBuffer: Buffer,
    mimeType: string,
    caption?: string,
    retryCount = 0,
  ): Promise<ReceiptExtractorOutput> {
    try {
      const base64Data = imageBuffer.toString('base64');

      const parts: Record<string, unknown>[] = [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType || 'image/jpeg',
          },
        },
        {
          text: `${RECEIPT_SYSTEM_PROMPT}${caption ? `\n\nNgười dùng có ghi chú kèm theo: "${caption}"` : ''}`,
        },
      ];

      const response = await this.ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const responseText = response.text?.trim() || '{}';
      const parsedJson = JSON.parse(responseText);

      const validationResult = ReceiptExtractorOutputSchema.safeParse(parsedJson);

      if (!validationResult.success) {
        logger.warn(
          { errors: validationResult.error.format(), raw: responseText, retryCount },
          'Zod validation thất bại cho ReceiptExtractor',
        );

        if (retryCount < 1) {
          logger.info('Thử lại ReceiptExtractor lần 2...');
          return this.extract(imageBuffer, mimeType, caption, retryCount + 1);
        }

        throw new Error(
          'Không thể trích xuất thông tin hoá đơn hợp lệ từ ảnh. Vui lòng chụp rõ nét hơn hoặc nhập thủ công bằng text.',
        );
      }

      return validationResult.data;
    } catch (error) {
      if (
        retryCount < 1 &&
        !(error instanceof Error && error.message.includes('Vui lòng chụp rõ nét'))
      ) {
        logger.warn({ error, retryCount }, 'Lỗi khi gọi Gemini Vision, thử lại lần 2...');
        return this.extract(imageBuffer, mimeType, caption, retryCount + 1);
      }
      logger.error({ error }, 'Thất bại khi phân tích ảnh hoá đơn');
      throw error;
    }
  }
}

export const receiptExtractor = new ReceiptExtractor();
