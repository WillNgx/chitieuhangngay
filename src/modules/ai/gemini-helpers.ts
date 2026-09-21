import { ApiError } from '@google/genai';

// Thời gian chờ trước khi gọi lại Gemini khi gặp lỗi tạm thời
export const GEMINI_RETRY_DELAY_MS = 1500;

// 429: vượt rate limit/quota, 503: model quá tải, 504: Gemini xử lý quá thời gian
const RETRYABLE_STATUS_CODES = new Set([429, 503, 504]);

/**
 * Chỉ các lỗi tạm thời mới đáng gọi lại; lỗi 400/401/404... gọi lại cũng vô ích
 */
export function isRetryableGeminiError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  // Lỗi mạng/timeout khi fetch (không có HTTP status)
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('fetch failed'))
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * JSON hỏng trả về null để đi chung luồng "output sai schema" (Zod báo lỗi rồi thử lại).
 * Model lite đôi khi bọc kết quả trong mảng `[ {...} ]` -> bóc ra nếu mảng chỉ có đúng 1 phần tử.
 */
export function parseJsonSafely(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
  } catch {
    return null;
  }
}
