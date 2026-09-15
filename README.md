# Telegram Expense Tracker Bot (AI-Powered)

Bot Telegram ghi nhận và quản lý chi tiêu gia đình dùng chung một ví (**shared wallet**), hỗ trợ **đa tiền tệ**, nhận diện text & ảnh hoá đơn bằng **Google Gemini 2.0 Flash (AI)**, tự động snapshot **quy đổi tỷ giá USD** tại thời điểm gửi tin nhắn, và tổng hợp báo cáo chi tiêu trực quan qua Telegram commands.

---

## 🚀 Tính năng chính

1. **Ghi nhận chi tiêu qua Text**: Nhập tự nhiên như "Ăn tối 250 THB", "Cà phê 45k", "Grab 120k". AI tự động trích xuất số tiền, loại tiền, danh mục, merchant, mục đích.
2. **Ghi nhận qua Ảnh Hoá đơn (Vision OCR)**: Gửi ảnh hoá đơn (kèm hoặc không kèm text chú thích). AI đọc toàn bộ thông tin thanh toán.
3. **Cơ chế Message Buffer (Gom nhóm 3 phút)**:
   - Gộp ảnh và text gửi trong vòng 3 phút thành 1 giao dịch duy nhất.
   - Nếu gửi 1 tin nhắn text mới trước khi hết 3 phút, hệ thống tự động chốt giao dịch cũ và bắt đầu giao dịch mới.
4. **Bắt buộc Xem trước & Xác nhận (Inline Keyboard)**:
   - Mọi giao dịch đều hiển thị Preview:
     ```text
     🍜 ABC Restaurant · 💰 850 THB · 💵 ≈ $26.30
     📂 Food → Restaurant · 🎯 Social
     [✅ Xác nhận]  [✏️ Sửa]  [❌ Huỷ]
     ```
5. **Đa tiền tệ & Snapshot tỷ giá USD**:
   - Tỷ giá được snapshot tại thời điểm nhận tin nhắn qua Frankfurter API + Open ER API fallback.
   - Báo cáo tổng hợp quy về chuẩn **USD**.
   - Toàn bộ số tiền và tỷ giá tính toán bằng kiểu `Decimal` chính xác tuyệt đối (không dùng float).
6. **Bảo mật Password-Gate**:
   - Người dùng mới lần đầu nhắn tin bot phải nhập đúng mật khẩu truy cập (`BOT_ACCESS_PASSWORD`).
   - Sau khi nhập đúng, tài khoản được kích hoạt vĩnh viễn (`is_authorized = true`).
7. **Lưu trữ ảnh hoá đơn có hạn (TTL 2 tháng)**:
   - Ảnh được nén tự động bằng `Sharp` và lưu trên Supabase Storage.
   - Job định kỳ tự động xoá file ảnh trên storage sau 60 ngày, **giữ nguyên dữ liệu OCR và transaction**.
8. **Báo cáo Thống kê & Quản lý**:
   - `/week`, `/month`, `/year`: Tổng hợp chi tiêu toàn bộ ví chung gia đình bằng USD, phân loại theo nhóm danh mục.
   - `/edit <id>`, `/delete <id>`: Chỉnh sửa hoặc xoá giao dịch đã ghi nhận.
9. **Chống trùng lặp Webhook**: Middleware Idempotency lọc bỏ các `update_id` gửi lại khi Telegram retry.

---

## 🛠️ Công nghệ sử dụng

- **Runtime**: Node.js 22/24 LTS
- **Language**: TypeScript (Strict mode)
- **API Framework**: Fastify 5
- **Bot Framework**: grammY
- **Database & ORM**: PostgreSQL (Supabase) + Prisma ORM (`Decimal` type)
- **AI Gateway**: Google GenAI SDK (`@google/genai`) + Gemini 2.0 Flash
- **Image Processing**: Sharp
- **Exchange Rates**: Frankfurter API + Open ER API
- **Testing**: Vitest

---

## 📁 Cấu trúc Thư mục

```text
src/
├── app/
│   ├── config.ts              # Validate cấu hình môi trường (.env qua Zod)
│   └── server.ts              # Fastify server & webhook route
├── modules/
│   ├── auth/                  # Password-gate, is_authorized
│   ├── transaction/           # Tạo, sửa, xoá, xác nhận giao dịch Decimal
│   ├── ai/                    # AI Gateway, ExpenseParser, ReceiptExtractor, QueryInterpreter
│   ├── currency/              # CurrencyService, Frankfurter & Open-ER providers
│   ├── analytics/             # ReportService tổng hợp chi tiêu USD
│   └── receipt/               # StorageService, ReceiptService, auto-cleanup job (2 tháng)
├── telegram/
│   ├── bot.ts                 # grammY instance & middlewares
│   ├── message-buffer.ts      # Gom nhóm tin nhắn cửa sổ 3 phút
│   ├── handlers/              # Command, Text, Photo, Callback handlers
│   ├── keyboards/             # Inline keyboards
│   └── utils/                 # Preview formatter, file downloader
├── infrastructure/            # Prisma client singleton, storage client
└── shared/                    # Structured logger (Pino), custom errors, utils
```

---

## ⚙️ Cài đặt & Chạy cục bộ

### 1. Cài đặt Dependencies

```bash
npm install
```

### 2. Cấu hình Biến môi trường

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Điền các giá trị:
- `TELEGRAM_BOT_TOKEN`: Token lấy từ [@BotFather](https://t.me/botfather).
- `BOT_ACCESS_PASSWORD`: Mật khẩu truy cập bot (mặc định: `mw1624` — **khuyến nghị đổi trước khi dùng thật**).
- `DATABASE_URL`: Connection string PostgreSQL từ Supabase.
- `GEMINI_API_KEY`: API Key từ Google AI Studio.
- `SUPABASE_URL` & `SUPABASE_SERVICE_KEY`: URL và Service Role key của Supabase project.

### 3. Database Migration & Seed Taxonomy Danh mục

```bash
# Sinh Prisma Client
npm run prisma:generate

# Chạy migration DB
npm run prisma:migrate

# Nạp dữ liệu cây danh mục chuẩn (Taxonomy)
npm run prisma:seed
```

### 4. Kiểm tra & Chạy Server

```bash
# Chạy Unit Tests
npm test

# Chạy Linter & Typecheck
npm run lint
npm run build

# Chạy Server phát triển
npm run dev
```

Kiểm tra health-check:
```bash
curl http://localhost:3000/health
```

---

## 🚀 Hướng dẫn Triển khai (Deploy Miễn phí)

### 1. Database & Storage trên Supabase (Free Tier)
1. Tạo project mới trên [Supabase](https://supabase.com).
2. Lấy `DATABASE_URL` (Connection pooling hoặc direct URI) dán vào biến môi trường.
3. Tạo Storage Bucket tên `receipts` (đặt là private).
4. Lấy `SUPABASE_URL` và `SUPABASE_SERVICE_KEY` trong mục Project Settings -> API.

### 2. Backend trên Render (Free Tier)
1. Tạo Web Service mới trên [Render](https://render.com) liên kết với Git repository này.
2. Cấu hình:
   - **Environment**: Node
   - **Build Command**: `npm install && npx prisma generate && npm run build && npx prisma migrate deploy`
   - **Start Command**: `npm start`
3. Thêm toàn bộ các biến môi trường từ file `.env`.
   Lệnh build đã chạy `prisma migrate deploy`, nên cần commit thư mục migration cùng source code.
4. Thiết lập Telegram Webhook:
   Gọi API của Telegram để trỏ webhook về server Render:
   ```bash
   curl -F "url=https://[YOUR-RENDER-APP].onrender.com/telegram/webhook" \
        -F "secret_token=[YOUR_WEBHOOK_SECRET]" \
        https://api.telegram.org/bot[YOUR_BOT_TOKEN]/setWebhook
   ```

> [!TIP]
> **Tránh Render Sleep (Cold Start)**: Vì Render free tier sẽ tạm ngủ sau 15 phút không có request, bạn có thể tạo một monitor miễn phí trên [cron-job.org](https://cron-job.org) hoặc [UptimeRobot](https://uptimerobot.com) để ping endpoint `https://[YOUR-APP].onrender.com/health` mỗi 10 phút một lần nhằm duy trì bot luôn sẵn sàng.
