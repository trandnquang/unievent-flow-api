// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import { queryEventRegistrationsSchema } from '../../schemas/registration.schema';
import {
  uuid,
  dateTime,
  nullableDateTime,
  registrationStatusSchema,
  checkinMethodSchema,
} from './common.docs';
import { ticketSchema } from './ticket.docs';

export const queryEventRegistrationsSchemaDocs = registry.register(
  'QueryEventRegistrations',
  queryEventRegistrationsSchema
);

// Nguyên hàng `registrations` (trừ quan hệ tickets, được trả song song ở cùng cấp)
export const registrationSchema = registry.register(
  'Registration',
  z.object({
    id: uuid(),
    event_id: uuid(),
    user_id: uuid(),
    status: registrationStatusSchema,
    requested_at: dateTime(),
    processed_at: nullableDateTime(
      'Thời điểm worker xử lý xong; null khi còn pending.'
    ),
  })
);

// data của POST /events/:eventId/registrations — HTTP 202 (BR-50)
export const createRegistrationResultSchema = registry.register(
  'CreateRegistrationResult',
  z.object({
    registration_id: uuid(),
    status: registrationStatusSchema.openapi({
      description:
        'Luôn là `pending` ở nhánh chính. Nhánh phát lại Idempotency-Key (mục 1.7) có thể trả `confirmed`/`failed` nếu request gốc đã xử lý xong.',
    }),
    expires_at: dateTime(
      'Mốc hết hạn giữ chỗ (BR-88). Nhánh chính = now + REGISTRATION_HOLD_TTL_SECONDS (mặc định 60s). Nhánh phát lại = now + TTL CÒN LẠI của khoá hold:; khoá đã hết/không còn thì trả chính thời điểm hiện tại (đồng hồ đếm ngược về 0 ngay). GIÁ TRỊ TÍNH, không phải cột CSDL.'
    ),
  })
);

// data của GET /registrations/:registrationId (FR-15/16) và POST .../cancel (FR-34)
export const registrationDetailResultSchema = z.object({
  registration: registrationSchema,
  ticket: ticketSchema.nullable().optional().openapi({
    description:
      'CHỈ có khi registration.status = confirmed. Frontend poll endpoint này cho tới khi field xuất hiện (mục 4 bước 5).',
  }),
});

// Một dòng của GET /events/:eventId/registrations (FR-41)
export const eventRegistrationItemSchema = registry.register(
  'EventRegistrationItem',
  z
    .object({
      user_id: uuid(),
      name: z.string(),
      email: z.email().openapi({
        description:
          '⚠️ PII (BR-114). Chỉ lộ cho chủ sự kiện và Co-host đã accepted — endpoint này KHÔNG được nới xuống public.',
      }),
      registered_at: dateTime('registrations.requested_at.'),
      reg_status: registrationStatusSchema,
      checkin_status: z.enum(['checked_in', 'not_checked_in']).openapi({
        description: 'Suy ra từ tickets.status.',
      }),
      checkin_method: checkinMethodSchema.nullable().openapi({
        description:
          '⭐ v1.1.0 — checkin_logs.checkin_method; null khi chưa check-in. Phân biệt quét QR tại cổng với tự check-in online.',
      }),
      checked_in_at: nullableDateTime(
        '⭐ v1.1.0 — checkin_logs.checkin_time; null khi chưa check-in.'
      ),
    })
    .openapi({
      description:
        'Ba field checkin_status / checkin_method / checked_in_at LUÔN nhất quán: đăng ký chưa confirmed hoặc vé chưa quét ⇒ hai field sau null cùng lúc checkin_status = not_checked_in.',
    })
);
