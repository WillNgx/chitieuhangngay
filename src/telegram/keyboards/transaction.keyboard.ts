import { InlineKeyboard } from 'grammy';

export function createTransactionPreviewKeyboard(transactionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Xác nhận', `tx_confirm:${transactionId}`)
    .text('✏️ Sửa', `tx_edit:${transactionId}`)
    .text('❌ Huỷ', `tx_cancel:${transactionId}`);
}

// Tin nhắn nhiều khoản: 1 nút cho cả nhóm, nhóm được nhận diện qua giao dịch đầu tiên
export function createBatchPreviewKeyboard(anchorTransactionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Xác nhận tất cả', `batch_confirm:${anchorTransactionId}`)
    .text('❌ Huỷ tất cả', `batch_cancel:${anchorTransactionId}`);
}

// Ảnh hoá đơn đang chờ ghi chú: bấm để xử lý luôn không cần đợi 2 phút
export function createProcessNowKeyboard(bufferId: string): InlineKeyboard {
  return new InlineKeyboard().text('⚡ Xử lý ngay', `buffer_flush:${bufferId}`);
}

export function createEditFieldKeyboard(transactionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('💰 Số tiền', `edit_field:${transactionId}:amount`)
    .text('📂 Danh mục', `edit_field:${transactionId}:category`)
    .row()
    .text('🏪 Cửa hàng', `edit_field:${transactionId}:merchant`)
    .text('🎯 Mục đích', `edit_field:${transactionId}:purpose`)
    .row()
    .text('🔙 Quay lại Preview', `edit_field:${transactionId}:back`);
}
