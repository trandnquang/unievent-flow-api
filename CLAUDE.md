# UniEvent Flow — Backend Context (CLAUDE.md)

## Nguồn sự thật duy nhất (single source of truth)

Không tự suy đoán, không tự thêm field / endpoint / bảng / cột / enum ngoài 4 tài liệu:

- `docs/srs.md` — SRS **v1.0.0** (FR-01 → FR-42: 42 FR, 42 UC, 127 BR) — thẩm quyền nghiệp vụ cao nhất
- `docs/api_spec.md` — API **v1.0.0** (50 endpoint; contract giữa Backend ↔ Frontend)
- `docs/erd.md` — ERD **v1.0.0** (9 bảng)
- `docs/schema.sql` — SCHEMA **v1.0.0** (nguồn sự thật CSDL; `prisma/schema.prisma` chỉ là bản introspect)
- `docs/seed.sql` — dữ liệu thử nghiệm (idempotent), chạy bằng `npm run seed`

Khi mâu thuẫn: về **nghiệp vụ** SRS > API > ERD; về **cấu trúc CSDL** thì `schema.sql` là chuẩn
(Prisma chỉ `db pull`, không tự định nghĩa lược đồ).

## Trạng thái hiện tại — doc **v1.0.0**, backend **đã verify runtime**

Đợt hardening đã đóng. Backend không còn ở mức "đã có mã nguồn" mà **đã được gọi thật và xác minh**:

- **50/50 endpoint verify runtime** — `npm run smoke` gọi lần lượt toàn bộ endpoint trên CSDL
  đã seed, đạt **95/95 phép kiểm PASS**. Mỗi lời gọi kiểm 3 lớp: HTTP status · envelope §1.2 ·
  quét đệ quy mọi khoá trong body bắt camelCase. Phủ 8 ca lỗi nghiệp vụ tiêu biểu và 2 luồng
  bất đồng bộ (đăng ký → vé phát ra; phân tích cảm xúc → summary đổi số).
- **Gemini + Cloudinary đã kết nối thật** bằng khoá thật, không mock (`npm run check:connections`
  → 6/6 PASS).
- **CORS đã mount**; **hai `CHECK` chỉ-có-ở-SQL đã chặn ở tầng Zod/service**.
- **4 tài liệu đã bump lên v1.0.0**, kèm `docs/seed.sql`.
- README.md đã viết lại phản ánh trạng thái thật.

Từ đây trở đi: **thay đổi nào cũng phải kèm cập nhật tài liệu tương ứng** — 4 tài liệu nay là
bản chốt v1.0.0, không còn ở trạng thái "đang đồng bộ ngược". Chạy lại `npm run smoke` sau mỗi
thay đổi cross-cutting.

### Bổ sung v1.1.0 — OpenAPI registry đã phủ 100%

- **`/api-docs.json` nay lộ đủ 42 path key · 52 operation** (51 endpoint REST nghiệp vụ +
  `GET /health`). Trước đợt này chỉ 8 operation của nhóm Auth & Account được đăng ký, nên
  `npm run gen:api` phía frontend sinh ra client rỗng cho 36 màn còn lại — mã nguồn đã có
  nhưng frontend không "nhìn thấy".
- **`npm run check:openapi` không còn danh sách cứng.** Nó đọc `src/routes/*.ts` dưới dạng
  **văn bản** (Express 5 đã bỏ `app._router`, và `import` file route sẽ mở kết nối
  ioredis/BullMQ), rồi đối chiếu **hai chiều**: route thiếu tài liệu ⇒ đỏ, tài liệu thừa
  operation ⇒ đỏ, `security.bearerAuth` lệch với `requireAuth` ⇒ đỏ. Thêm route mới mà quên
  `registerPath` sẽ bị bắt ngay.
- **`GET /health` được đăng ký kèm ghi đè `servers: [{url:'/'}]` ở cấp operation** vì nó nằm
  ngoài tiền tố `/api/v1`. Bỏ dòng đó đi thì Swagger UI gọi `/api/v1/health` → 404.
- 5 thay đổi hành vi D1–D5 của api_spec v1.1.0 đã hiện thực (xem bất biến #8, #9 bên dưới).

## Ràng buộc kỹ thuật cố định

- Node.js + Express + TypeScript **strict mode**.
- PostgreSQL chạy trong Docker, schema đã apply — **KHÔNG** `prisma migrate dev`,
  chỉ `npx prisma db pull` (introspect-only). Tự quản migration bằng SQL thuần.
- **Redis + BullMQ**: bộ đếm vé, khoá giữ chỗ, khoá check-in **nằm HOÀN TOÀN trên Redis**
  (không có cột PostgreSQL tương ứng — thiết kế hai pha có chủ đích, SRS §2.2.3).
- Zod validate (`exactOptionalPropertyTypes`), JWT + bcrypt.
- **LLM phân tích cảm xúc = Google Gemini** (BR-72): `GEMINI_API_KEY`, `GEMINI_MODEL`
  (mặc định `gemini-2.5-flash`). Ép JSON output theo schema; chia lô 50 phản hồi/lần gọi.
- **Lưu trữ ảnh = Cloudinary** (BR-111): `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` / `_FOLDER`.
  FR-40 chỉ trả URL; app **KHÔNG** lưu tệp nhị phân, chỉ ghi URL vào `cover_image` / `avatar_url`.
- Response envelope / mã lỗi theo `api_spec.md` §1.2–1.4; cấu trúc thư mục theo §11.
- Comment nghiệp vụ **tiếng Việt** kèm mã BR/MSG; tên biến/hàm **tiếng Anh**.

## Bất biến PHẢI giữ — đừng phá khi sửa về sau

Đây là các ràng buộc đã trả giá để tìm ra. Sửa mã mà phá một trong số này thì `npm run smoke`
sẽ đỏ, nhưng lý do hỏng không hiển nhiên — nên đọc trước khi đụng vào vùng liên quan.

1. **Hai ràng buộc `CHECK` chỉ tồn tại ở SQL, Prisma KHÔNG introspect được** → tầng Zod/service
   PHẢI tự chặn, nếu không lỗi CSDL thô thành **HTTP 500** thay vì lỗi nghiệp vụ rõ ràng:
   - `chk_checkin_method_organizer`: `self` ⇒ `organizer_id` NULL; `qr_scan` ⇒ NOT NULL (BR-66).
     Toàn repo chỉ có **đúng 2 nơi** ghi `checkin_logs` — thêm nơi thứ 3 thì phải tự chặn lại.
   - `feedbacks.rating BETWEEN 1 AND 5`.
2. **VIEW `v_event_registration_stats` KHÔNG có trong `schema.prisma`** → mọi truy vấn tới view
   này phải dùng `$queryRaw`, không được coi là model Prisma.
3. **Trạng thái sống trên Redis KHÔNG có cột PostgreSQL tương ứng** (thiết kế hai pha, SRS §2.2.3).
   Reset CSDL mà không dọn Redis sẽ để lại trạng thái mồ côi rất khó truy — ca đã gặp thật: khoá
   `checkin:{ticketId}` TTL 24h sống sót qua lần seed sau, khiến vé vừa đưa về `valid` vẫn trả
   `already_checked_in`. Năm nhóm khoá phải dọn cùng lúc với CSDL:
   `event:{eventId}:tickets` · `checkin:{ticketId}` · `hold:{registrationId}` ·
   `idem:{userId}:{key}` · `active:{userId}`. (`npm run seed` đã lo việc này.)
4. **Suy giảm mềm khi thiếu key ngoài — phải nổi lên tới NGƯỜI GỌI, không chỉ tồn tại trong worker.**
   Thiếu `GEMINI_API_KEY` → `POST /events/:id/feedbacks/analyze` trả `503 SENTIMENT_UNAVAILABLE`
   **ngay tại endpoint**, không nhận job rồi thất bại lặng lẽ. Cloudinary lỗi → `502 UPLOAD_FAILED`
   (MSG-48). API vẫn khởi động bình thường trong cả hai trường hợp.
5. **Lỗi dịch vụ LLM ≠ lỗi một lô.** Sai khoá (401/403), sai model (404), hết quota (429) phải làm
   job **thất bại**; chỉ lỗi tạm thời của từng lô mới được nuốt. Nuốt cả hai như nhau khiến job báo
   thành công với 0 kết quả — đúng cách mà mô hình `gemini-2.5-flash` bị Google khai tử đã trốn
   thoát khỏi mọi log suốt một thời gian.
6. **`GEMINI_MODEL` không được dùng bí danh trôi** (`gemini-flash-latest`): mô hình phía sau đổi thì
   kết quả phân tích tự đổi mà không có commit nào. Mặc định hiện tại `gemini-3.5-flash-lite`.
7. **`tickets.jwt_code` KHÔNG được trả ra JSON** — nó chỉ sống trong ảnh QR (`qr_code_data_url`).
   ⭐ v1.1.0: `ticket.service.ts` nay liệt kê **tường minh** từng field ở cả `getTicketForUser`
   lẫn `listMyTickets`, thay cho `const { jwt_code, ...rest }` cũ. **Đừng đổi ngược về spread** —
   cách cũ chỉ cần thêm một cột vào bảng `tickets` là âm thầm rò cột mới ra JSON.
8. **`expires_at` ở nhánh phát lại Idempotency-Key phải đọc TTL CÒN LẠI từ Redis**, không được
   dùng `now + REGISTRATION_HOLD_TTL_SECONDS` (`RegistrationService.holdExpiresAt`). Khoá giữ chỗ
   đặt ở request GỐC, có thể đã trôi gần hết — trả mốc đầy đủ sẽ tặng client tối đa N giây ảo,
   khiến đồng hồ đếm ngược ở M3-S03 chạy quá thời điểm job `timeout` đã bù trừ xong và người dùng
   ngồi nhìn bộ đếm còn 40 giây cho một đăng ký đã `failed`.
9. **Ghi đè khoá của schema có `.refine()` phải dùng `.safeExtend()`, KHÔNG phải `.extend()`.**
   Zod 4 ném `Cannot overwrite keys on object schemas containing refinements` — và vì việc này
   xảy ra lúc **import**, nó làm chết cả `npm run dev`, không chỉ tài liệu. Cạm bẫy: `.extend()`
   dùng để **thêm khoá mới** vẫn hợp lệ, chỉ **ghi đè** mới hỏng — nên một phép thử vội bằng
   `.extend({ khoá_mới })` sẽ báo "không sao" một cách sai lệch. Áp dụng cho
   `createEventSchema` / `updateEventSchema` / `queryEventsSchema` / `create|updateEventScheduleSchema`
   ở tầng `src/docs/schemas/*.docs.ts` (ghi đè field `z.coerce.date()` để bỏ `nullable: true` thừa).
10. **Bộ quét route của `scripts/check-openapi.ts` PHẢI bỏ chú thích trước khi quét.**
   `src/routes/organizer.routes.ts` có một comment cảnh báo chứa nguyên văn `router.use(requireAuth, …)`;
   không strip comment thì bộ quét "đọc" chính lời cảnh báo đó và kết luận nhầm rằng cả file bị
   khoá bởi guard cấp router, làm `GET /organizers/:userId` (PUBLIC theo BR-27) bị báo sai.

## Quy ước casing (wire format — KHÔNG hỏi lại)

Toàn bộ field và wrapper key trong request/response body dùng **snake_case**
(`location_type`, `organizer_code`, `schedule_item`, `co_host`, `qr_token`, `checked_in_at`,
`registration_id`, `sentiment_breakdown`, `top_keywords`, `average_rating`, `is_active`, ...),
BẤT KỂ tài liệu mô tả bằng camelCase. camelCase trong văn bản tài liệu chỉ mang tính diễn giải,
không phải wire format ràng buộc.

## Nguyên tắc làm việc

- **Schema là nguồn sự thật CSDL**: không thêm hạ tầng không có chỗ dựa schema (đã bác tính năng
  bản đồ vì `location` chỉ là text, không toạ độ).
- **Phái sinh hơn thêm cột**: mã vé rút gọn, `registered_count`... suy ra ở tầng ứng dụng, tránh migrate.
- **Ma trận truy vết KHÔNG đáng tin** — verify endpoint / mã lỗi / cột trong **thân tài liệu và mã nguồn**.
- Biến thể **BR/MSG có hậu tố chữ** (BR-46e, BR-40b...) phải grep riêng — sort số sẽ gộp sai.
- Thay đổi **cross-cutting / bảo mật**: dùng **plan mode**, dừng chờ duyệt trước khi sửa.
- **Module-by-module, mỗi prompt một mối quan tâm** — không gộp nhiều concern vào một pass.
