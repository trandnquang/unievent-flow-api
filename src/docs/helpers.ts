// Import ĐẦU TIÊN (xem zod-openapi.ts).
import { z } from './zod-openapi';
import type { ZodType } from 'zod';

// Helper phía REQUEST dùng chung cho 15 file *.paths.ts.

// Body JSON. Chuyển từ paths/auth.paths.ts ra đây khi số file dùng đi từ 1 lên 13.
export const jsonBody = (schema: ZodType, description: string) => ({
  description,
  required: true,
  content: { 'application/json': { schema } },
});

// === Tham số đường dẫn =======================================================
//
// TÊN THAM SỐ GIỮ NGUYÊN camelCase (eventId, ticketId…) VÌ ĐÓ LÀ TÊN THAM SỐ CỦA EXPRESS
// (`router.get('/:eventId', …)`), KHÔNG phải field trong body. Placeholder `{eventId}` không
// bao giờ đi trên dây — chỉ giá trị UUID đi. Giữ đúng tên khiến path key của tài liệu KHỚP
// BYTE-TO-BYTE với chuỗi route trong src/routes/*.routes.ts, nhờ đó scripts/check-openapi.ts
// đối chiếu được route ↔ tài liệu mà không cần bảng quy đổi nào.
//
// Quy ước snake_case ở CLAUDE.md áp cho field/wrapper key trong BODY — không áp cho đoạn URL.
const uuidPathParam = (description: string) =>
  z.uuid().openapi({
    description,
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    param: { description },
  });

export const eventIdParam = z.object({ eventId: uuidPathParam('ID sự kiện') });
export const userIdParam = z.object({ userId: uuidPathParam('ID người dùng') });
export const ticketIdParam = z.object({ ticketId: uuidPathParam('ID vé') });
export const registrationIdParam = z.object({
  registrationId: uuidPathParam('ID đăng ký'),
});
export const eventUpdateIdParam = z.object({
  eventId: uuidPathParam('ID sự kiện'),
  updateId: uuidPathParam('ID thông báo'),
});
export const eventScheduleIdParam = z.object({
  eventId: uuidPathParam('ID sự kiện'),
  scheduleId: uuidPathParam('ID mốc lịch trình'),
});
export const eventCoHostIdParam = z.object({
  eventId: uuidPathParam('ID sự kiện'),
  userId: uuidPathParam('ID Ban tổ chức được gỡ'),
});

// === Body multipart ==========================================================
//
// FR-40 (BR-104/105). Tên field `file` PHẢI khớp `upload.single('file')` ở
// src/routes/upload.routes.ts — sai tên thì multer không thấy tệp và trả 400 BAD_REQUEST.
// Dùng z.string().openapi({format:'binary'}) chứ KHÔNG dùng z.any(): z.any() sinh ra schema
// không có `required: ['file']`, làm tài liệu nói tệp là tuỳ chọn.
export const multipartFileBody = (
  description: string,
  fieldDescription: string
) => ({
  description,
  required: true,
  content: {
    'multipart/form-data': {
      schema: z.object({
        file: z
          .string()
          .openapi({ format: 'binary', description: fieldDescription }),
      }),
    },
  },
});
