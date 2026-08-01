// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import { paginationSchema } from '../../schemas/common.schema';

// Thành phần dùng chung cho MỌI nhóm endpoint. Đây là đòn bẩy tái dùng lớn nhất của cây docs:
// 9 enum dưới đây được tham chiếu ở hàng chục schema khác, nên khi CSDL đổi một giá trị enum
// thì chỉ sửa đúng một chỗ.
//
// Nguồn: prisma/schema.prisma (bản introspect của docs/schema.sql — nguồn sự thật CSDL).
// CHIỀU IMPORT MỘT HƯỚNG: file này KHÔNG import bất kỳ *.docs.ts nào khác, mọi file khác
// import nó. Nhờ vậy không có vòng lặp import trong cây docs.

// === Enum CSDL ===============================================================

export const userRoleSchema = registry.register(
  'UserRole',
  z.enum(['student', 'organizer', 'admin']).openapi({
    description:
      'BR-01: đăng ký công khai LUÔN ra student. Tài khoản organizer chỉ được cấp qua POST /admin/organizers (FR-38).',
  })
);

export const eventStatusSchema = registry.register(
  'EventStatus',
  z.enum(['active', 'cancelled']).openapi({
    description: 'Không có trạng thái `draft` — SRS đã bỏ tính năng "Lưu nháp".',
  })
);

export const eventCategorySchema = registry.register(
  'EventCategory',
  z.enum([
    'academic',
    'competition',
    'seminar_workshop',
    'career',
    'volunteer',
    'arts_entertainment',
    'sports',
    'orientation',
    'other',
  ])
);

export const eventLocationTypeSchema = registry.register(
  'EventLocationType',
  z.enum(['in_person', 'online']).openapi({
    description:
      'Quyết định luồng check-in: in_person quét QR tại cổng (FR-19/20), online sinh viên tự check-in (FR-36).',
  })
);

export const registrationStatusSchema = registry.register(
  'RegistrationStatus',
  z.enum(['pending', 'confirmed', 'failed', 'cancelled']).openapi({
    description:
      'Luồng bất đồng bộ (SRS §2.2.3): POST trả pending, worker chuyển sang confirmed (kèm vé) hoặc failed.',
  })
);

export const ticketStatusSchema = registry.register(
  'TicketStatus',
  z.enum(['valid', 'checked_in', 'cancelled'])
);

export const checkinMethodSchema = registry.register(
  'CheckinMethod',
  z.enum(['qr_scan', 'self']).openapi({
    description:
      'BR-66: qr_scan luôn kèm organizer_id; self (sinh viên tự check-in sự kiện online) luôn có organizer_id NULL.',
  })
);

export const sentimentLabelSchema = registry.register(
  'SentimentLabel',
  z.enum(['positive', 'negative', 'neutral']).openapi({
    description: 'BR-72: do Google Gemini gán, không phải người nhập.',
  })
);

export const coHostStatusSchema = registry.register(
  'CoHostStatus',
  z.enum(['pending', 'accepted', 'declined']).openapi({
    description:
      'BR-113: chỉ Co-host ở trạng thái accepted mới có quyền vận hành sự kiện.',
  })
);

// === Kiểu nguyên thuỷ lặp lại ================================================

export const uuid = () => z.uuid();
export const dateTime = (description?: string) =>
  z.string().openapi(description ? { format: 'date-time', description } : { format: 'date-time' });
export const nullableDateTime = (description: string) =>
  z.string().nullable().openapi({ format: 'date-time', description });

// === Query phân trang dùng chung (mục 1.5) ===================================

// Cho endpoint danh sách chỉ nhận đúng {page, limit}, không có bộ lọc riêng.
export const paginationQuerySchema = registry.register(
  'Pagination',
  paginationSchema
);

// === Tham chiếu người dùng rút gọn ===========================================

export const userRefSchema = registry.register(
  'UserRef',
  z.object({
    id: uuid(),
    name: z.string().openapi({ example: 'Nguyễn Văn An' }),
  })
);

export const publicUserRefSchema = registry.register(
  'PublicUserRef',
  z
    .object({
      id: uuid(),
      name: z.string(),
      avatar_url: z.string().nullable(),
    })
    .openapi({
      description:
        'Tham chiếu người dùng dùng ở ngữ cảnh CÔNG KHAI — KHÔNG chứa email (BR-26).',
    })
);

// === Sự kiện =================================================================

// Toàn bộ hàng `events`. Dùng ở GET /events/:id, GET /users/me/tickets (lồng trong vé)…
export const eventSchema = registry.register(
  'Event',
  z.object({
    id: uuid(),
    organizer_id: uuid(),
    title: z.string().openapi({ example: 'Ngày hội việc làm 2026' }),
    description: z.string().nullable(),
    cover_image: z.string().nullable().openapi({
      description: 'URL Cloudinary do POST /uploads/image trả về (BR-111).',
    }),
    location: z.string().nullable(),
    location_type: eventLocationTypeSchema,
    join_url: z.string().nullable(),
    category: eventCategorySchema.nullable(),
    club_name: z.string().nullable(),
    start_time: dateTime(),
    end_time: dateTime(),
    max_tickets: z.number().int().openapi({ example: 200 }),
    status: eventStatusSchema,
    cancel_reason: z.string().nullable(),
    cancelled_by: uuid().nullable(),
    cancelled_at: z.string().nullable().openapi({ format: 'date-time' }),
    created_at: dateTime(),
    updated_at: dateTime(),
  })
);

// Bản rút gọn lồng trong vé (GET /users/me/tickets, GET /tickets/:id).
export const eventSummarySchema = registry.register(
  'EventSummary',
  z
    .object({
      id: uuid(),
      title: z.string(),
      cover_image: z.string().nullable().optional(),
      location: z.string().nullable(),
      location_type: eventLocationTypeSchema,
      join_url: z.string().nullable().optional(),
      start_time: dateTime(),
      end_time: dateTime(),
      status: eventStatusSchema,
    })
    .openapi({
      description:
        'Bản rút gọn của Event lồng trong vé. Tập cột khác nhau đôi chút giữa danh sách vé (có cover_image) và chi tiết vé (có join_url).',
    })
);

// data của các endpoint chỉ trả 200/204 kèm xác nhận, không có payload nghiệp vụ.
export const emptyResultSchema = registry.register(
  'EmptyResult',
  z.object({}).openapi({ description: 'Không có trường nào.' })
);
