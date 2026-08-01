// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';

// data của GET /events/:eventId/dashboard (FR-27/28, BR-77).
// Gộp 2 nhóm số liệu trong MỘT lần gọi để giao diện không phải ghép từ nhiều endpoint.
export const dashboardResultSchema = registry.register(
  'DashboardResult',
  z.object({
    registrations: z.object({
      total: z.number().int().openapi({
        description:
          'Số đăng ký đang CHIẾM CHỖ (confirmed + pending) — cùng cách đếm với registered_count công khai ở BR-33b, để hai màn hình không lệch nhau.',
      }),
      confirmed: z.number().int(),
      checked_in: z.number().int(),
      remaining: z.number().int().openapi({
        description:
          'BR-33: đọc từ bộ đếm Redis; lùi về cột tickets_remaining_db của view v_event_registration_stats nếu khoá Redis không tồn tại.',
      }),
    }),
    sentiment: z.object({
      breakdown: z.object({
        positive: z.number().int(),
        negative: z.number().int(),
        neutral: z.number().int(),
      }),
      top_keywords: z.array(
        z.object({ keyword: z.string(), count: z.number().int() })
      ),
      average_rating: z.number().nullable(),
      total_feedbacks: z.number().int(),
    }),
  })
);
