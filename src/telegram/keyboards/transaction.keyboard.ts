import { InlineKeyboard } from 'grammy';

export function createTransactionPreviewKeyboard(transactionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Xác nhận', `tx_confirm:${transactionId}`)
    .text('✏️ Sửa', `tx_edit:${transactionId}`)
    .text('❌ Huỷ', `tx_cancel:${transactionId}`);
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
