# Prompt hoàn chỉnh — Code dự án "Telegram Expense Tracker Bot"

> Dùng file này làm **prompt khởi động** cho AI coding assistant (Claude Code, Cursor, GPT...) để triển khai toàn bộ dự án. Luôn đính kèm `CLAUDE.md` cùng lúc — file này định nghĩa **quy trình làm việc**, `CLAUDE.md` định nghĩa **spec/kiến trúc**. Tất cả Open Question trong `CLAUDE.md` đã được chốt — không còn mục nào cần hỏi lại trước khi code, trừ khi phát sinh vấn đề mới ngoài dự kiến.

---

## 0. Vai trò & cách làm việc

Bạn là một **Fullstack Developer cấp senior**, làm việc theo đúng kiến trúc và convention đã chốt trong `CLAUDE.md`. Nguyên tắc bắt buộc:

1. **Không tự ý đổi kiến trúc/tech stack** đã chốt trong `CLAUDE.md`. Nếu thấy có vấn đề (thư viện lỗi thời, cách tiếp cận không ổn...), dừng lại và **báo cáo rõ vấn đề + đề xuất thay thế**, không tự ý đổi rồi code luôn.
2. **Không tự suy diễn business rule.** Nếu phát sinh case mới không có trong `CLAUDE.md`, dừng lại hỏi trước khi code phần liên quan, thay vì tự giả định.
3. Làm theo đúng **Definition of Ready** ở mục 5 bên dưới — không nhảy sang phase sau khi phase trước chưa đạt tiêu chuẩn.
4. Sau mỗi phase, tóm tắt: đã làm gì, test ra sao, còn thiếu gì, rủi ro gì.
5. Tiền luôn dùng kiểu `Decimal`, không bao giờ `number`/`float`. AI không ghi DB trực tiếp — output AI luôn qua Zod trước khi vào business logic. Mật khẩu/secrets luôn qua env, không hardcode.

---

## 1. Input cho AI

Trước khi bắt đầu, đảm bảo AI có:
- File `CLAUDE.md` (project context, schema, tech stack, convention, toàn bộ decision).
- File này (`PROMPT_CODE_DU_AN.md`).
- Quyền tạo repo mới / thư mục mới theo `Project Structure` trong `CLAUDE.md` mục 9.

---

## 2. Mục tiêu cuối cùng (Definition of Done cho V1)

Một bot Telegram dùng trong gia đình, khi user nhắn:
- **Lần đầu chat** → bot yêu cầu nhập mật khẩu (`BOT_ACCESS_PASSWORD`); đúng → được phép dùng bot lâu dài; sai → từ chối, cho thử lại.
- Tin nhắn text mô tả chi tiêu → bot parse bằng AI, hiển thị preview kèm nút Xác nhận/Sửa/Huỷ, ghi vào DB sau khi xác nhận.
- Ảnh hoá đơn (có hoặc không kèm caption text gửi trong vòng 3 phút) → AI đọc ảnh, trích xuất amount/currency/merchant/category, gộp với text liên quan nếu có, cùng luồng xác nhận như trên.
- Command `/week`, `/month`, `/year` → trả về tổng chi tiêu (USD) trong khoảng thời gian tương ứng, có breakdown theo category, tính trên toàn bộ ví chung (không lọc theo user).
- Command `/edit <id>`, `/delete <id>` → sửa/xoá giao dịch đã confirmed.
- Ảnh hoá đơn tự động bị xoá khỏi storage sau 2 tháng (transaction vẫn giữ nguyên).

Toàn bộ giao dịch dùng chung 1 database (shared wallet), tỷ giá được snapshot tại thời điểm nhận tin nhắn.

---

## 3. Phạm vi KHÔNG làm trong V1 (out of scope)

- Tính năng vị trí (location) — **đã loại bỏ hoàn toàn**, không tạo handler/bảng liên quan.
- Redis/BullMQ (chỉ setup khi có nhu cầu xử lý async thực sự).
- Multi-provider AI Gateway đầy đủ (chỉ cần abstraction đủ để sau này cắm thêm provider, không cần implement provider thứ 2 ngay).
- Budget/hạn mức cảnh báo, export CSV/Excel.
- Rate limit theo user (gia đình dùng, traffic thấp).
- Đa ngôn ngữ giao diện bot (mặc định tiếng Việt).
- Backdate transaction phức tạp (tỷ giá luôn lấy tại thời điểm nhận tin nhắn).

---

## 4. Roadmap triển khai theo Phase

### Phase 0 — Setup nền tảng
- Khởi tạo repo, cấu trúc thư mục theo `CLAUDE.md` mục 9.
- Cấu hình TypeScript, ESLint, Prettier, Husky + lint-staged.
- Tạo project Supabase (Postgres + Storage), cấu hình Prisma kết nối.
- Setup Pino logger, config qua env — `.env.example` đầy đủ: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `GEMINI_API_KEY`, `EXCHANGE_RATE_API_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (hoặc `R2_*` nếu chọn nhánh R2), `BOT_ACCESS_PASSWORD`.
- **DoD Phase 0:** `npm run dev` chạy được server rỗng, kết nối DB thành công, lint/format pass.

### Phase 1 — Database & Schema
- Viết Prisma schema đầy đủ theo `CLAUDE.md` mục 6 (`users`, `categories`, `transactions`, `receipts`, `exchange_rates`, `ai_extractions` — **không có bảng `locations`**).
- Migration + seed dữ liệu `categories` theo taxonomy ở mục 7.
- **DoD Phase 1:** Migration chạy sạch, seed data đúng, có thể query thử qua Prisma Studio.

### Phase 2 — Telegram Bot khung sườn + Auth password-gate
- Setup grammY ở **webhook mode** (theo quyết định deploy Render — xem `CLAUDE.md` mục 11).
- `AuthService` + middleware: user chưa `is_authorized` → hỏi mật khẩu; so khớp `BOT_ACCESS_PASSWORD`; đúng → tạo/update record `users.is_authorized = true`; sai → từ chối, cho thử lại.
- Handler rỗng cho text/photo/command để xác nhận routing hoạt động (không có location handler).
- **DoD Phase 2:** User mới nhắn bot → được hỏi mật khẩu; nhập đúng → dùng được các lệnh khác; nhập sai → bị chặn và có thể thử lại.

### Phase 3 — AI Gateway & Parsing
- `AIService` (AI Gateway) + `ExpenseParser` (text) + `ReceiptExtractor` (vision).
- Định nghĩa Zod schema cho từng loại output AI.
- Prompt Gemini: input text/ảnh → output JSON đúng schema (amount, currency, merchant, category, purpose, confidence).
- Xử lý trường hợp Zod invalid → retry 1 lần, sau đó hỏi lại user nhập rõ hơn.
- **DoD Phase 3:** Test với ≥10 câu text mẫu và ≥5 ảnh hoá đơn mẫu, tỷ lệ parse hợp lệ (qua Zod) chấp nhận được, log lại các case fail để review.

### Phase 4 — Currency & Transaction Service
- `CurrencyService`: gọi Frankfurter, có fallback provider, cache rate trong ngày để giảm call API.
- `TransactionService`: nhận JSON đã validate → tính `usd_amount`, snapshot `exchange_rate` + `exchange_rate_at` = thời điểm nhận tin nhắn.
- **DoD Phase 4:** Tạo transaction với `status = pending_confirm`, số liệu quy đổi đúng, có unit test cho phần tính toán tiền.

### Phase 5 — Gom nhóm message & Luồng xác nhận
- Cơ chế buffer theo `chat_id`, cửa sổ **3 phút**: gộp text + photo đến trong khoảng này thành 1 giao dịch; hết 3 phút hoặc có tin nhắn text mới → chốt giao dịch hiện tại với dữ liệu đã có (theo `CLAUDE.md` mục 8).
- Bot gửi preview kèm inline keyboard `✅ Xác nhận | ✏️ Sửa | ❌ Huỷ` — **bắt buộc cho MỌI giao dịch**.
- Xử lý callback: Xác nhận → `status = confirmed`; Sửa → flow chỉnh field; Huỷ → `status = rejected`.
- **DoD Phase 5:** Test đầy đủ 3 nhánh callback; test gửi text rồi gửi ảnh trong vòng 3 phút → gộp đúng 1 giao dịch; test để quá 3 phút → tách thành 2 giao dịch riêng.

### Phase 6 — Receipt Storage & Auto-cleanup
- `ReceiptService` + `StorageService`: nén ảnh bằng Sharp, upload lên Supabase Storage, lưu `storage_key` + `ocr_data` + `expires_at` (created_at + 2 tháng).
- `receipt-cleanup.job.ts`: cron chạy định kỳ (vd mỗi ngày), tìm receipt có `expires_at` đã qua → xoá file trên storage, set `storage_key = null`, **giữ nguyên `ocr_data` và transaction**.
- **DoD Phase 6:** Ảnh hoá đơn upload thành công, có thể xem lại; job cleanup test được bằng cách seed `expires_at` giả trong quá khứ và chạy thử.

### Phase 7 — Analytics & Report Commands
- `SummaryService`/`ReportService`: tổng hợp theo tuần/tháng/năm, **chỉ USD**, breakdown theo category, tính trên **toàn bộ ví chung** (không lọc theo user).
- Command `/week`, `/month`, `/year`.
- **DoD Phase 7:** Số liệu report khớp với dữ liệu seed test, timezone xử lý đúng.

### Phase 8 — Edit/Delete
- Command `/edit <id>`, `/delete <id>` cho giao dịch đã confirmed.
- **DoD Phase 8:** Sửa/xoá đúng transaction, không ảnh hưởng snapshot tỷ giá của giao dịch khác.

### Phase 9 — Hardening & Deploy
- Idempotency key khi xử lý webhook Telegram (tránh ghi trùng khi Telegram retry).
- Structured error handling toàn hệ thống (không để lỗi raw lộ ra bot).
- Deploy backend lên **Render** (webhook mode), DB + Storage trên **Supabase** (theo `CLAUDE.md` mục 11).
- Nếu cần tránh cold-start do Render sleep: setup 1 job ping định kỳ (cron-job.org / UptimeRobot) gọi health-check endpoint mỗi 10–14 phút.
- Viết README hướng dẫn deploy + đầy đủ biến môi trường cần thiết + nhắc đổi `BOT_ACCESS_PASSWORD` khỏi giá trị mặc định trước khi dùng thật.
- **DoD Phase 9:** Deploy thành công lên môi trường thật, test end-to-end với dữ liệu thật, webhook nhận tin ổn định.

---

## 5. Definition of Ready trước khi bắt đầu mỗi Phase

Trước khi code 1 phase, xác nhận:
- [ ] Phase trước đã đạt DoD.
- [ ] Không có case nghiệp vụ mới nào phát sinh mà `CLAUDE.md` chưa cover (nếu có → dừng, hỏi lại trước).
- [ ] Đã biết rõ input/output của phase (schema, contract giữa các module).

---

## 6. Quy tắc report tiến độ

Sau mỗi phase, trả lời theo cấu trúc:

```
## Phase X — <tên>
### Đã làm
### Cách đã test
### DoD đạt/chưa đạt (nêu rõ điểm chưa đạt nếu có)
### Rủi ro / điểm cần lưu ý
### Việc cần xác nhận trước khi sang phase tiếp theo (nếu có)
```

Không tự ý gộp nhiều phase lại rồi báo cáo 1 lần — làm tới đâu, xác nhận tới đó, để dễ review và không đi lạc hướng kiến trúc đã chốt.
