// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  scanCheckinSchema,
  queryCheckinsSchema,
} from '../../schemas/checkin.schema';
import { uuid, dateTime, checkinMethodSchema } from './common.docs';

export const scanCheckinBodySchema = registry.register(
  'ScanCheckinBody',
  scanCheckinSchema
);

export const queryCheckinsSchemaDocs = registry.register(
  'QueryCheckins',
  queryCheckinsSchema
);

// data của POST /events/:eventId/checkin/scan (FR-19/20).
// Luôn HTTP 200 cho một request kỹ thuật hợp lệ — kết quả nghiệp vụ nằm ở `result`, nhờ đó
// organizer UI phân biệt được vé dùng lại / vé giả / vé hết hạn (api_spec.md mục 5).
export const scanResultSchema = registry.register(
  'ScanResult',
  z.object({
    result: z
      .enum([
        'valid',
        'already_checked_in',
        'invalid_signature',
        'event_mismatch',
        'cancelled_ticket',
        'expired_ticket',
      ])
      .openapi({
        description:
          'valid → màn HỢP LỆ (xanh) · already_checked_in → ĐÃ CHECK-IN (hổ phách, kèm checked_in_at) · bốn giá trị còn lại → TỪ CHỐI (đỏ), phụ đề đổi theo giá trị (MSG-45).',
      }),
    attendee: z
      .object({
        name: z.string(),
        event_title: z.string(),
      })
      .optional(),
    checked_in_at: z.string().optional().openapi({
      format: 'date-time',
      description:
        'CHỈ có khi result = already_checked_in — checkin_logs.checkin_time của lần check-in GỐC, để màn "ĐÃ CHECK-IN" hiển thị đúng thời điểm vào lần đầu.',
    }),
  })
);

// Một dòng lịch sử check-in (FR-21)
export const checkinItemSchema = registry.register(
  'CheckinItem',
  z.object({
    id: uuid(),
    ticket_id: uuid(),
    user_id: uuid(),
    name: z.string(),
    email: z.email().openapi({
      description: '⚠️ PII — chỉ lộ cho chủ sự kiện và Co-host đã accepted (BR-63).',
    }),
    checkin_time: dateTime(),
    checkin_method: checkinMethodSchema,
    checked_in_by: z.string().nullable().openapi({
      description:
        'Tên Ban tổ chức đã quét. NULL với checkin_method = self (BR-66: sinh viên tự check-in thì organizer_id là NULL).',
    }),
  })
);

// ⭐ v1.1.0 (api_spec.md mục 5) — bộ đếm "đã vào / tổng" cho màn quét QR tại cổng.
export const checkinSummarySchema = registry.register(
  'CheckinSummary',
  z
    .object({
      confirmed: z.number().int().openapi({
        description: "COUNT(registrations) của sự kiện với status = 'confirmed'.",
        example: 120,
      }),
      checked_in: z.number().int().openapi({
        description: "COUNT(tickets) của sự kiện với status = 'checked_in'.",
        example: 87,
      }),
    })
    .openapi({
      description:
        'Giá trị tổng của TOÀN SỰ KIỆN, ĐỘC LẬP với page/limit — khác với meta.pagination.total (số bản ghi checkin_logs của danh sách đang phân trang). Có mặt ở đây vì GET /events/:id/dashboard là owner-only trong khi endpoint này là owner-or-cohost, nên không có nó thì Co-host không hiển thị được bộ đếm.',
    })
);
