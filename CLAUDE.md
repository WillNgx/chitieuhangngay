# CLAUDE.md — Telegram Expense Tracker Bot (AI-powered)

> File này là **project context** dùng cho AI coding assistant (Claude, GPT, Gemini CLI...) khi làm việc trên repo này. Đọc file này trước khi sinh code.

---

## 1. Tổng quan dự án

Bot Telegram giúp ghi nhận và theo dõi chi tiêu **gia đình** (nhiều người cùng dùng, chung 1 ví), hỗ trợ **đa tiền tệ**, nhập liệu nhanh qua **text / ảnh hoá đơn**, tự động **phân loại bằng AI**, tự động **quy đổi tỷ giá về USD** tại thời điểm gửi tin, và trả về **tổng chi tiêu theo tuần/tháng/năm** qua command.

**Nguyên tắc kiến trúc cốt lõi (đã chốt từ đầu — không được vi phạm khi code):**
> AI chỉ chịu trách nhiệm **hiểu input và phân loại**. Toàn bộ tính toán tiền, snapshot tỷ giá, tổng hợp thống kê và lưu dữ liệu do **backend/database** đảm nhiệm. AI **không** được ghi database trực tiếp — mọi output của AI phải đi qua Zod validation trước khi tới business logic.

---

## 2. Actor & Scope

- [FACT] Người dùng thường xuyên mua sắm với nhiều loại tiền tệ khác nhau.
- [DECISION] Bot hỗ trợ **nhiều tài khoản Telegram (người nhà)**, tất cả cùng ghi vào **1 "ví" (wallet) chung — 1 database chung, không tách theo từng user**. `transactions.user_id` vẫn giữ để biết *ai* là người tạo giao dịch (hiển thị "ai chi" + audit), nhưng **báo cáo tổng hợp luôn tính trên toàn bộ ví chung**, không filter theo từng user.
- [DECISION] **Xác thực bằng password-gate**, không dùng admin whitelist thủ công: lần đầu 1 `telegram_id` nhắn bot, bot yêu cầu nhập mật khẩu truy cập. Nhập đúng → tạo record trong bảng `users` với `is_authorized = true`, từ đó về sau không hỏi lại. Nhập sai → từ chối, cho thử lại (có thể giới hạn số lần thử để tránh brute-force cơ bản).
  - Mật khẩu đọc từ biến môi trường `BOT_ACCESS_PASSWORD` (**không hardcode trong code**). Giá trị hiện tại dùng cho V1: `mw1624` — nên đổi giá trị này (và không commit vào git) trước khi public repo hoặc chia sẻ cho người khác.
  - Mọi handler khác (text/photo/command) đều phải qua middleware kiểm tra `is_authorized` trước khi xử lý.

---

## 3. Functional Requirements

| ID | Requirement | Nguồn |
|---|---|---|
| FR1 | Ghi nhận chi tiêu nhanh qua tin nhắn text (vd: "Ăn tối 250 THB"), 1 tin có thể gồm nhiều khoản (mỗi dòng 1 khoản) | [FACT] |
| FR2 | Ghi nhận kèm ảnh hoá đơn, AI đọc ảnh (vision) để trích xuất dữ liệu | [FACT] |
| FR3 | Hỗ trợ nhiều loại tiền tệ (không giới hạn 1 currency) | [FACT] |
| FR4 | Command trả tổng chi tiêu theo tuần / tháng / năm (USD) | [FACT] |
| FR5 | AI tự động phân loại category + mục đích (purpose) chi tiêu | [FACT] |
| FR6 | Tự động lấy tỷ giá, quy đổi ra USD **tại thời điểm gửi tin**, lưu snapshot | [FACT] |
| FR7 | Preview (Confirm/Edit/Huỷ) bắt buộc trước khi ghi nhận chính thức; không bấm gì sau 5 phút → tự động xác nhận | [DECISION] |
| FR8 | `/edit`, `/delete` để sửa/xoá giao dịch đã confirmed | [FACT] |
| FR9 | Xác thực người dùng bằng password lần đầu chat với bot | [DECISION] |

> [DECISION] Đã **bỏ tính năng ghi nhận vị trí (location)** khỏi phạm vi dự án — không thu thập, không lưu toạ độ.

---

## 4. Kiến trúc hệ thống

```
Telegram (text / photo)
        │
        ▼
   grammY (Telegram Bot Framework)
        │
        ▼
  Auth Middleware (password-gate, kiểm tra is_authorized)
        │
        ▼
  Application Layer (Fastify)
        │
   ┌────┼────────────┐
   ▼    ▼             ▼
Transaction   AI Gateway     Analytics
 Service      (Gemini)       Service
   │            │  │            │
   │          Zod  │            │
   │       (validate output)    │
   └────────────┼───────────────┘
                ▼
           PostgreSQL (Prisma)
                │
      ┌─────────┴─────────┐
      ▼                   ▼
 Exchange Rate API   Object Storage (receipt image, TTL 2 tháng)
```

AI Gateway được thiết kế để **pluggable** (Gemini hiện tại, có thể thêm OpenAI / local model sau mà không đổi business logic).

---

## 5. Tech Stack

| Layer | Công nghệ | Ghi chú |
|---|---|---|
| Runtime | Node.js 24 LTS | |
| Language | TypeScript | toàn bộ backend |
| API Framework | Fastify | HTTP API / webhook |
| Telegram | grammY | |
| Database | PostgreSQL | transaction + analytics |
| ORM | Prisma | dùng `Decimal`, **không dùng number/float cho tiền** |
| Validation | Zod | validate input + AI output |
| AI | Gemini API (Google GenAI SDK) | parse text + vision + classification |
| Image processing | Sharp | resize/compress trước khi gửi Gemini / lưu storage |
| Currency | Frankfurter API + fallback provider | lấy rate tại thời điểm gửi tin |
| Date/Time | date-fns + date-fns-tz | xử lý timezone theo user |
| HTTP Client | ofetch | |
| Cache / Queue | Redis / BullMQ | **chưa cần cho V1** |
| Storage | Supabase Storage (khuyến nghị) hoặc Cloudflare R2 | ảnh hoá đơn, auto-xoá sau 2 tháng |
| Testing | Vitest | |
| Logging | Pino | structured logging |
| Lint/Format | ESLint + Prettier + Husky + lint-staged | |
| Deploy (backend) | **Render (free tier)** | xem mục 11 — lý do chọn & trade-off |
| DB + Storage hosting | **Supabase (free tier)** | Postgres + Storage cùng 1 chỗ, đơn giản hoá hạ tầng |

Đây là đề xuất gốc từ chủ dự án, đã điều chỉnh phần Deploy/Storage theo khảo sát free-tier hiện tại (mục 11) — coi là **[DECISION]** cho V1.

---

## 6. Database Schema (PostgreSQL, quản lý qua Prisma)

```
users
├── id
├── telegram_id        (unique)
├── display_name         // để hiển thị "ai chi" trong report
├── is_authorized         // true sau khi nhập đúng password lần đầu
├── timezone
├── default_currency
└── created_at

categories
├── id
├── parent_id           // hỗ trợ category → subcategory
├── name
└── type

transactions
├── id
├── user_id                // người tạo giao dịch (không dùng để lọc report)
├── amount                 // Decimal, số gốc theo currency giao dịch
├── currency                // THB, USD, VND...
├── usd_amount              // Decimal, đã quy đổi
├── exchange_rate           // Decimal, tỷ giá dùng để quy đổi
├── exchange_rate_at         // = thời điểm nhận tin nhắn (xem mục 11)
├── category_id
├── merchant
├── description
├── purpose
├── transaction_at          // mặc định = thời điểm bot nhận tin nhắn
├── source                   // text | receipt | manual
├── ai_confidence
├── status                   // pending_confirm | confirmed | rejected
├── created_at
└── updated_at

receipts
├── id
├── transaction_id
├── telegram_file_id
├── storage_key             // object storage key, null sau khi bị auto-xoá
├── mime_type
├── file_size
├── ocr_data                 // raw text/JSON Gemini trích xuất từ ảnh (giữ lại dù ảnh gốc bị xoá)
├── expires_at                // created_at + 2 tháng, dùng cho job auto-xoá
└── created_at

exchange_rates
├── id
├── base_currency
├── target_currency
├── rate
├── rate_date
└── provider

ai_extractions
├── id
├── transaction_id
├── model
├── raw_input
├── extracted_json
├── confidence
└── created_at
```

> [DECISION] Đã bỏ bảng `locations` (không còn tính năng location). Bảng `receipts` có thêm `expires_at` để phục vụ job tự động xoá file ảnh sau 2 tháng — **chỉ xoá file trên storage** (`storage_key = null`), **giữ nguyên `ocr_data` và transaction** để lịch sử report không bị mất số liệu.

---

## 7. Category Taxonomy

```
Food: Restaurant, Fast Food, Coffee, Groceries, Delivery, 7-Eleven, Big C
Transport: Grab, Taxi, Bus, Train, Fuel, Parking, Rental
Shopping: Clothes, Electronics, Games, Household, Other
Entertainment: Movie, Game, Subscription, Event
Health: Medicine, Hospital, Fitness
Bills: Internet, Phone, Electricity, Other
Travel: Hotel, Sightseeing, Immigration, Laundry
```

> Travel, Food/Big C, Transport/Rental được thêm khi nhập dữ liệu chuyến Lào/Thái (08–09/2026). "Ks" = khách sạn → Travel/Hotel.

Lưu trong bảng `categories` (self-referencing `parent_id`), **không hardcode enum** — để user (hoặc AI) có thể mở rộng category sau này.

---

## 8. Luồng xử lý tin nhắn (Message Flow)

```
User gửi text và/hoặc photo
        ↓
Auth Middleware kiểm tra is_authorized (xem mục 2)
        ↓
grammY Handler (text handler / photo handler riêng)
        ↓
[DECISION] Text xử lý ngay, chỉ ảnh mới chờ ghi chú:
  - Tin text (không có ảnh đang chờ) → xử lý NGAY (chạy nền, webhook trả về tức thì).
    1 tin có thể gồm nhiều khoản (mỗi dòng 1 khoản) → chỉ gọi AI 1 lần cho cả tin,
    tối đa 20 khoản/tin.
  - Ảnh có caption → xử lý ngay (caption là ghi chú).
  - Ảnh không caption → buffer theo chat_id, bot trả lời kèm nút [⚡ Xử lý ngay].
    Chốt khi: user gửi tin text (thành ghi chú của ảnh), HOẶC bấm ⚡,
    HOẶC hết 2 phút → tự xử lý chỉ với dữ liệu đã có.
  - Album nhiều ảnh → 1 giao dịch (ảnh đầu), ảnh đến trễ của album đã xử lý bị bỏ qua.
        ↓
AI Gateway → Gemini (text hoặc vision) → Structured JSON
        ↓
Zod validate
   ├─ invalid → retry / hỏi lại user
   └─ valid → tiếp tục
        ↓
Exchange Rate Service: lấy tỷ giá tại thời điểm NHẬN TIN NHẮN
(transaction_at = exchange_rate_at = thời điểm nhận tin, không hỗ trợ
parse ngày quá khứ dạng "hôm qua" trong V1 — để đơn giản hoá)
        ↓
Transaction Service ghi PostgreSQL với status = pending_confirm
        ↓
Bot gửi PREVIEW kèm inline keyboard (BẮT BUỘC, mọi trường hợp):
🍜 ABC Restaurant · 💰 850 THB · 💵 ≈ $26.30
📂 Food → Restaurant · 🎯 Social
[✅ Xác nhận]  [✏️ Sửa]  [❌ Huỷ]
(Tin nhiều khoản → 1 preview liệt kê từng khoản + tổng USD,
 nút [✅ Xác nhận tất cả] [❌ Huỷ tất cả]; nhóm nhận diện bằng user_id + transaction_at)
        ↓
User bấm nút (không bấm gì trong 5 phút kể từ lúc tạo/sửa → job tự động confirmed,
              bot sửa tin preview thành "✅ ĐÃ TỰ ĐỘNG XÁC NHẬN" và gỡ nút)
   ├─ ✅ Xác nhận → status = confirmed, bot reply "✅ Expense recorded"
   ├─ ✏️ Sửa      → mở flow chỉnh sửa field (category/amount/...), rồi quay lại preview
   │               (sửa được giao dịch pending_confirm và confirmed, không sửa được rejected)
   └─ ❌ Huỷ       → status = rejected (hoặc xoá record pending)
```

---

## 9. Project Structure

```
src/
├── app/
│   ├── server.ts
│   └── config.ts
├── modules/
│   ├── auth/
│   │   └── auth.service.ts       // password-gate, is_authorized
│   ├── transaction/
│   │   ├── transaction.service.ts
│   │   ├── transaction.repository.ts
│   │   ├── transaction.schema.ts
│   │   └── transaction.types.ts
│   ├── ai/
│   │   ├── ai.service.ts        // AI Gateway
│   │   ├── expense-parser.ts
│   │   ├── receipt-extractor.ts
│   │   └── query-interpreter.ts
│   ├── currency/
│   │   ├── currency.service.ts
│   │   └── providers/
│   ├── analytics/
│   │   ├── summary.service.ts
│   │   └── report.service.ts
│   └── receipt/
│       ├── receipt.service.ts
│       ├── storage.service.ts
│       └── receipt-cleanup.job.ts   // cron xoá receipt sau 2 tháng
├── telegram/
│   ├── bot.ts
│   ├── handlers/
│   │   ├── text.handler.ts
│   │   ├── photo.handler.ts
│   │   └── command.handler.ts
│   └── keyboards/
├── infrastructure/
│   ├── database/
│   ├── storage/
│   └── http/
└── shared/
    ├── errors/
    ├── logger/
    └── utils/
```

---

## 10. Coding Conventions bắt buộc

1. **Tiền luôn dùng `Decimal`** (Prisma `Decimal` type) — không bao giờ dùng `number`/`float` để lưu hoặc tính toán amount.
2. **AI không được ghi DB trực tiếp.** Luồng bắt buộc: `Gemini → JSON → Zod validate → Business Rules → PostgreSQL`.
3. Mọi output từ Gemini phải qua Zod schema tương ứng (`expense-parser` output ≠ `receipt-extractor` output ≠ `query-interpreter` output — mỗi loại 1 schema riêng).
4. AI Service chia theo nhiệm vụ rõ ràng: `ExpenseParser`, `ReceiptExtractor`, `ExpenseClassifier`, `QueryInterpreter`, `ChatAssistant` — không gộp logic vào 1 prompt lớn.
5. Secrets/API key/mật khẩu qua biến môi trường, không hardcode.
6. Logging có cấu trúc (Pino), không dùng `console.log` trong code nghiệp vụ.

---

## 11. Đã chốt (Decisions) — tất cả Open Questions đã được giải đáp

- [DECISION] Multi-account, **shared wallet chung**, xác thực qua **password-gate** (mục 2).
- [DECISION] **Luôn hiển thị preview** (Confirm/Edit/Huỷ) trước khi ghi `status = confirmed`. Nếu **không bấm gì sau 5 phút** (tính từ lúc tạo/sửa lần cuối) → job quét mỗi 30 giây **tự động xác nhận** (tin nhiều khoản được xác nhận cả nhóm).
- [DECISION] Report tổng hợp (`/week`, `/month`, `/year`) **chỉ hiển thị USD**.
- [DECISION] **Text xử lý ngay** (hỗ trợ nhiều khoản/tin, mỗi dòng 1 khoản). **Chỉ ảnh không caption mới chờ ghi chú**: nút ⚡ Xử lý ngay, tự xử lý sau **2 phút**, chốt sớm khi có tin text (mục 8). Thay cho quyết định cũ "buffer 3 phút cho mọi tin" vì làm mỗi tin text phải chờ 3 phút.
- [DECISION] Tỷ giá luôn lấy **tại thời điểm nhận tin nhắn** — V1 không hỗ trợ backdate/parse ngày quá khứ.
- [DECISION] **Không cần** tính năng ngân sách/hạn mức (budget) trong V1.
- [DECISION] **Không cần** tính năng xuất dữ liệu (CSV/Excel) trong V1.
- [DECISION] **Bỏ hoàn toàn tính năng location.**
- [DECISION] Ảnh hoá đơn **lưu 2 tháng, tự động xoá** sau đó (giữ lại `ocr_data` + transaction).
- [DECISION] Chỉ người nhà dùng, **không cần rate limit** theo user trong V1.
- [DECISION] Chạy bot ở **webhook mode**.
- [DECISION] Có **idempotency key** khi xử lý webhook Telegram (tránh ghi trùng transaction khi Telegram retry).

### Đề xuất Deploy free (đã khảo sát, tính tới thời điểm hiện tại)

Vì đây là bot dùng nội bộ gia đình, traffic thấp, ưu tiên **free + đơn giản** hơn là hiệu năng cao:

- **Backend (Node.js/Fastify):** [RECOMMENDATION] **Render** — free web service, không cần thẻ, nhưng **sleep sau ~15 phút không có traffic** (lần gọi đầu sau khi ngủ có thể chậm vài chục giây). Với bot gia đình dùng không liên tục, chấp nhận được; nếu muốn tránh độ trễ này, có thể dùng dịch vụ ping định kỳ miễn phí (vd cron-job.org, UptimeRobot) gọi 1 endpoint health-check mỗi 10–14 phút để giữ service không ngủ.
  - [DECISION] Server **tự ping `/health` mỗi 14 phút** qua URL công khai (`RENDER_EXTERNAL_URL` do Render tự cấp, fallback domain của `TELEGRAM_WEBHOOK_URL`), chỉ bật khi `NODE_ENV=production`. Lưu ý: chạy liên tục ~720–744 giờ/tháng, gần hết 750 giờ free/tháng của Render → không nên chạy thêm service free khác trên cùng tài khoản.
  - Phương án thay thế nếu cần always-on thật sự và chấp nhận cung cấp thẻ để xác minh: **Northflank** (free tier cho 2 service, không sleep).
  - Railway hiện **không còn free tier vĩnh viễn** (chỉ có $5 credit dùng thử rồi tính phí) nên không đề xuất cho V1.
- **Database + Storage ảnh hoá đơn:** [RECOMMENDATION] **Supabase** free tier — vừa có Postgres free vĩnh viễn (không thẻ), vừa có Storage free trong cùng 1 project, giúp gộp 2 nhu cầu (DB + lưu ảnh hoá đơn) vào 1 dịch vụ duy nhất thay vì tách riêng Cloudflare R2, đơn giản hoá hạ tầng cho 1 dự án gia đình. Lưu ý: Supabase **tạm dừng (pause) project nếu không có hoạt động trong 1 tuần**, cold-start lại mất 1–2 giây khi có truy vấn đầu tiên — chấp nhận được cho use-case này.
  - Phương án thay thế: **Neon** (Postgres free vĩnh viễn, scale-to-zero, resume gần như tức thì) nếu muốn tách riêng DB, khi đó vẫn cần chọn thêm 1 nơi lưu ảnh (Cloudflare R2 free tier là lựa chọn hợp lý).

> Lưu ý: thông tin free-tier của các nhà cung cấp thay đổi khá thường xuyên — nên kiểm tra lại trang pricing chính thức của Render/Supabase/Neon trước khi triển khai thật.
