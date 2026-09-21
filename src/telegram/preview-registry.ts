export interface PreviewLocation {
  chatId: number;
  messageId: number;
}

/**
 * Nhớ tin nhắn xem trước (có nút xác nhận) của từng giao dịch đang chờ,
 * để job tự xác nhận sửa lại đúng tin đó và gỡ nút.
 * Lưu trong bộ nhớ: mất khi server khởi động lại -> job gửi tin mới thay vì sửa tin cũ.
 */
export class PreviewRegistry {
  private locations = new Map<string, PreviewLocation>();

  register(transactionIds: string[], location: PreviewLocation): void {
    for (const id of transactionIds) {
      this.locations.set(id, location);
    }
  }

  /**
   * Lấy vị trí tin xem trước của nhóm giao dịch và xoá khỏi registry
   */
  take(transactionIds: string[]): PreviewLocation | undefined {
    const location = transactionIds
      .map((id) => this.locations.get(id))
      .find((found) => found !== undefined);
    this.forget(transactionIds);
    return location;
  }

  forget(transactionIds: string[]): void {
    for (const id of transactionIds) {
      this.locations.delete(id);
    }
  }
}

export const previewRegistry = new PreviewRegistry();
