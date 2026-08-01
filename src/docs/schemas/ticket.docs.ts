// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  uuid,
  dateTime,
  nullableDateTime,
  ticketStatusSchema,
  registrationStatusSchema,
  eventSummarySchema,
} from './common.docs';

// ⚠️ CLAUDE.md bất biến #7 — KHÔNG schema nào trong file này được có field `jwt_code`.
// Chuỗi JWT của vé chỉ sống trong ảnh QR (`qr_code_data_url`). Contract OpenAPI ở đây là
// lớp phòng thủ thứ hai sau việc liệt kê tường minh field ở src/services/ticket.service.ts.

// Nguyên hàng `tickets` TRỪ jwt_code — lồng trong GET /registrations/:id
export const ticketSchema = registry.register(
  'Ticket',
  z
    .object({
      id: uuid(),
      registration_id: uuid(),
      status: ticketStatusSchema,
      issued_at: dateTime(),
    })
    .openapi({
      description:
        'KHÔNG BAO GIỜ chứa tickets.jwt_code (CLAUDE.md bất biến #7).',
    })
);

// Một dòng của GET /users/me/tickets (FR-17)
export const myTicketItemSchema = registry.register(
  'MyTicketItem',
  z.object({
    id: uuid(),
    status: ticketStatusSchema,
    issued_at: dateTime(),
    registration_id: uuid(),
    registration_status: registrationStatusSchema,
    event: eventSummarySchema,
  })
);

// `ticket` của GET /tickets/:ticketId (FR-18) — ⭐ v1.1.0 mở rộng, xem api_spec.md mục 4.
export const ticketDetailSchema = registry.register(
  'TicketDetail',
  z
    .object({
      id: uuid(),
      status: ticketStatusSchema,
      issued_at: dateTime(),
      registration_id: uuid(),
      registration_status: registrationStatusSchema,
      event_title: z.string().openapi({
        description: '⭐ v1.1.0 — events.title (JOIN qua registrations.event_id).',
      }),
      holder_name: z.string().openapi({
        description: '⭐ v1.1.0 — users.name (JOIN qua registrations.user_id).',
      }),
      checked_in_at: nullableDateTime(
        '⭐ v1.1.0 — checkin_logs.checkin_time qua LEFT JOIN (ticket_id UNIQUE ⇒ 1-1); null nếu chưa check-in.'
      ),
      // `.optional()` chứ KHÔNG `.nullable()`: api_spec.md mục 4 quy định khoá VẮNG MẶT.
      join_url: z.string().optional().openapi({
        description:
          '⭐ v1.1.0 — CHỈ xuất hiện khi events.location_type = "online" (BR-107). Sự kiện in_person KHÔNG CÓ khoá này trong response (không phải null) — tránh lộ một khoá vô nghĩa cho vé tại cổng.',
      }),
      event: eventSummarySchema,
    })
    .openapi({
      description:
        'Superset của khối liệt kê ở api_spec.md mục 4: giữ thêm registration_id, registration_status và `event` lồng vốn đã có từ v0.4.8, để không phá vỡ consumer đang chạy. KHÔNG BAO GIỜ chứa jwt_code.',
    })
);

// data của GET /tickets/:ticketId
export const ticketDetailResultSchema = z.object({
  ticket: ticketDetailSchema,
  qr_code_data_url: z.string().openapi({
    description:
      'Ảnh QR PNG dạng data URI base64, sinh TẠI CHỖ từ tickets.jwt_code — không gọi dịch vụ ngoài. Đây là nơi DUY NHẤT chuỗi JWT của vé xuất hiện.',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA…',
  }),
});

// data của POST /tickets/:ticketId/self-checkin (FR-36)
export const selfCheckinResultSchema = z.object({
  ticket: z.object({
    id: uuid(),
    status: ticketStatusSchema.openapi({ example: 'checked_in' }),
  }),
});
