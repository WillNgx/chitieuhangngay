import { GoogleGenAI } from '@google/genai';
import { env } from '../../app/config.js';
import { logger } from '../../shared/logger/index.js';
import { QueryInterpreterOutput, QueryInterpreterOutputSchema } from './ai.types.js';

export class QueryInterpreter {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async interpret(query: string): Promise<QueryInterpreterOutput> {
    try {
      const response = await this.ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Phân tích câu hỏi về thống kê chi tiêu sau đây và trả về JSON:
                timeframe: 'week' | 'month' | 'year' | 'all'
                category: tên danh mục nếu người dùng muốn lọc riêng, hoặc null
                
                Câu hỏi: "${query}"`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: env.GEMINI_THINKING_LEVEL },
        },
      });

      const responseText = response.text?.trim() || '{}';
      const parsedJson = JSON.parse(responseText);
      const validation = QueryInterpreterOutputSchema.safeParse(parsedJson);

      if (!validation.success) {
        return { timeframe: 'month', category: null };
      }

      return validation.data;
    } catch (error) {
      logger.warn({ error, query }, 'Lỗi khi diễn giải câu lệnh thống kê');
      return { timeframe: 'month', category: null };
    }
  }
}

export const queryInterpreter = new QueryInterpreter();
