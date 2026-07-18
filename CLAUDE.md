# UniEvent Flow — Backend Context

## Nguồn sự thật duy nhất (không tự suy đoán, không tự thêm field/endpoint)

- docs/srs.md
- docs/api_spec.md
- docs/erd.md
- docs/schema.sql

## Ràng buộc kỹ thuật cố định

- Node.js + Express + TypeScript strict mode
- PostgreSQL đã chạy trong Docker, schema đã apply — KHÔNG chạy `prisma migrate dev`,
  chỉ dùng `npx prisma db pull` (introspect-only)
- Zod validate, JWT + bcrypt
- Response envelope / mã lỗi theo đúng api-spec.md mục 1.2–1.4
- Cấu trúc thư mục theo api-spec.md mục 11
- Comment business rule bằng tiếng Việt, code (biến/hàm) bằng tiếng Anh

## Trạng thái hiện tại

Đã hoàn thành Giai đoạn A→E theo bản tài liệu CŨ (28 FR, API v0.1.0).
Tài liệu đã cập nhật lên 37 FR (v0.2.1/v0.3.1) — CẦN AUDIT lại A→E trước khi làm tiếp F trở đi.

## Quy ước casing (quyết định tại Giai đoạn F, áp dụng toàn hệ thống)

Toàn bộ field và wrapper key trong request/response body dùng snake_case
(vd: location_type, organizer_code, schedule_item, co_host), BẤT KỂ API.md
viết dạng camelCase trong văn bản mô tả. API.md dùng camelCase chỉ mang tính
diễn giải, không phải wire format ràng buộc. Không hỏi lại quyết định này.
