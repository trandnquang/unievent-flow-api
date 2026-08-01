// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  createFeedbackSchema,
  queryMyFeedbacksSchema,
  queryEventFeedbacksSchema,
} from '../../schemas/feedback.schema';
import {
  uuid,
  dateTime,
  nullableDateTime,
  sentimentLabelSchema,
  userRefSchema,
} from './common.docs';

export const createFeedbackBodySchema = registry.register(
  'CreateFeedbackBody',
  createFeedbackSchema
);

export const queryMyFeedbacksSchemaDocs = registry.register(
  'QueryMyFeedbacks',
  queryMyFeedbacksSchema
);

export const queryEventFeedbacksSchemaDocs = registry.register(
  'QueryEventFeedbacks',
  queryEventFeedbacksSchema
);

// data của POST /events/:eventId/feedbacks (FR-23) — nguyên hàng `feedbacks`
export const feedbackSchema = registry.register(
  'Feedback',
  z.object({
    id: uuid(),
    event_id: uuid(),
    user_id: uuid(),
    ticket_id: uuid(),
    rating: z.number().int().min(1).max(5).openapi({
      description:
        'Ràng buộc CHECK ở tầng SQL (rating BETWEEN 1 AND 5) — tầng Zod chặn trước để lỗi ra dạng nghiệp vụ thay vì HTTP 500.',
    }),
    content: z.string().nullable(),
    sentiment_label: sentimentLabelSchema.nullable(),
    keywords: z.string().nullable(),
    analyzed_at: nullableDateTime('null cho tới khi FR-25 chạy xong.'),
    created_at: dateTime(),
  })
);

// Một dòng của GET /events/:eventId/feedbacks (FR-24, dành cho Ban tổ chức)
export const eventFeedbackItemSchema = registry.register(
  'EventFeedbackItem',
  z.object({
    id: uuid(),
    rating: z.number().int(),
    content: z.string().nullable(),
    sentiment_label: sentimentLabelSchema.nullable(),
    keywords: z.array(z.string()).openapi({
      description:
        'Cột CSDL là TEXT phân tách bằng dấu phẩy; API trả về dạng MẢNG để FE không phải tự tách.',
    }),
    analyzed_at: nullableDateTime('null nếu phản hồi chưa được phân tích.'),
    created_at: dateTime(),
    user: userRefSchema,
  })
);

// Một dòng của GET /users/me/feedbacks (FR-42, BR-122) — của CHÍNH người đang đăng nhập.
// Wire thật là snake_case (src/services/feedback.service.ts); bảng mục 4 của api_spec.md
// từng ghi {eventName, createdAt} — đó là mô tả cũ đã sửa ở v1.1.0, không phải wire format.
export const myFeedbackItemSchema = registry.register(
  'MyFeedbackItem',
  z.object({
    event_name: z.string().openapi({ description: 'events.title.' }),
    rating: z.number().int(),
    content: z.string().nullable(),
    created_at: dateTime(),
  })
);

// data của GET /events/:eventId/feedbacks/summary (FR-26) — tái dùng cả trong dashboard
export const feedbackSummarySchema = registry.register(
  'FeedbackSummary',
  z.object({
    sentiment_breakdown: z.object({
      positive: z.number().int(),
      negative: z.number().int(),
      neutral: z.number().int(),
    }),
    top_keywords: z
      .array(z.object({ keyword: z.string(), count: z.number().int() }))
      .openapi({
        description:
          'Tối đa 10 từ khoá, sắp theo tần suất giảm dần. Đếm ở tầng ứng dụng vì cột keywords là TEXT, không phải mảng SQL.',
      }),
    average_rating: z.number().nullable().openapi({
      description:
        'BR-77: trung bình cộng THÔ của rating, làm tròn 2 chữ số. KHÔNG suy ra từ sentiment_label. null khi chưa có phản hồi nào.',
      example: 4.35,
    }),
    total_feedbacks: z.number().int(),
  })
);
