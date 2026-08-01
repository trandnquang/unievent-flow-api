// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import {
  successResponse,
  errorResponse,
  listResponse,
  wrappedResponse,
} from '../envelope';
import {
  unauthorized,
  forbidden,
  validationError,
  eventNotFound,
  eventScopedErrors,
} from '../errors';
import { jsonBody, eventIdParam } from '../helpers';
import { emptyResultSchema } from '../schemas/common.docs';
import {
  createFeedbackBodySchema,
  queryEventFeedbacksSchemaDocs,
  feedbackSchema,
  eventFeedbackItemSchema,
  feedbackSummarySchema,
} from '../schemas/feedback.docs';

const TAG = 'Feedback';

// FR-23 — POST /events/:eventId/feedbacks
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/feedbacks',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Gửi phản hồi cho sự kiện đã tham dự (FR-23)',
  description:
    'Chỉ role=student. BR-67 (Attendance Condition Rule): CHỈ nhận phản hồi khi người gửi có vé đã ' +
    '`checked_in` cho chính sự kiện đó. Điều kiện này thoả bởi CẢ HAI luồng check-in — quét QR tại cổng ' +
    '(FR-19/20) lẫn sinh viên tự xác nhận sự kiện online (FR-36).\n\n' +
    '`rating` nằm trong 1..5: đây là ràng buộc CHECK ở tầng SQL, tầng Zod chặn trước để lỗi ra dạng ' +
    'nghiệp vụ thay vì HTTP 500. Mỗi vé gửi được đúng một phản hồi (ticket_id UNIQUE).',
  request: {
    params: eventIdParam,
    body: jsonBody(createFeedbackBodySchema, 'Điểm đánh giá và nội dung'),
  },
  responses: {
    201: wrappedResponse('Phản hồi vừa gửi', 'feedback', feedbackSchema),
    400: validationError,
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    409: errorResponse('Đã gửi phản hồi cho sự kiện này rồi', [
      'FEEDBACK_ALREADY_SUBMITTED',
    ]),
    422: errorResponse('Chưa tham dự sự kiện (BR-67)', ['NOT_ATTENDED']),
  },
});

// FR-24 — GET /events/:eventId/feedbacks
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/feedbacks',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Phản hồi của sự kiện (FR-24)',
  description:
    'CHỈ chủ sự kiện (requireOwnerOnly) — khác các endpoint check-in vốn cho cả Co-host. ' +
    'Lọc được theo `sentiment`. `keywords` trả về dạng MẢNG dù cột CSDL là TEXT phân tách bằng dấu phẩy.\n\n' +
    'Khác GET /users/me/feedbacks (FR-42) vốn dành cho sinh viên xem phản hồi CHÍNH MÌNH đã gửi.',
  request: { params: eventIdParam, query: queryEventFeedbacksSchemaDocs },
  responses: {
    200: listResponse('Danh sách phản hồi', 'feedbacks', eventFeedbackItemSchema),
    ...eventScopedErrors,
  },
});

// FR-25 — POST /events/:eventId/feedbacks/analyze
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/feedbacks/analyze',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Chạy phân tích cảm xúc bằng AI (FR-25)',
  description:
    'CHỈ chủ sự kiện. Trả **202** — công việc chạy trong worker nền; poll ' +
    'GET /events/:eventId/feedbacks/summary để thấy số liệu đổi.\n\n' +
    'BR-72: mô hình là Google Gemini, ép JSON output theo schema, chia lô 50 phản hồi mỗi lần gọi.\n\n' +
    '⚠️ Thiếu `GEMINI_API_KEY` → **503 SENTIMENT_UNAVAILABLE trả NGAY TẠI ENDPOINT NÀY**, không nhận job ' +
    'rồi thất bại lặng lẽ. API vẫn khởi động bình thường khi thiếu khoá — đây là suy giảm mềm có chủ đích, ' +
    'nhưng phải nổi lên tới người gọi.',
  request: { params: eventIdParam },
  responses: {
    202: successResponse(
      'Đã nhận yêu cầu phân tích (body rỗng)',
      emptyResultSchema
    ),
    ...eventScopedErrors,
    503: errorResponse(
      'Chưa cấu hình GEMINI_API_KEY — tính năng phân tích cảm xúc không khả dụng (BR-72)',
      ['SENTIMENT_UNAVAILABLE']
    ),
  },
});

// FR-26 — GET /events/:eventId/feedbacks/summary
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/feedbacks/summary',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Tổng hợp cảm xúc phản hồi (FR-26)',
  description:
    'CHỈ chủ sự kiện. Số liệu này được GET /events/:eventId/dashboard (FR-27) tái dùng nguyên vẹn — ' +
    'cùng một service, không viết lại truy vấn, nên hai màn hình không bao giờ lệch số.\n\n' +
    'BR-77: `average_rating` là trung bình cộng THÔ của `rating`, KHÔNG suy ra từ `sentiment_label`.',
  request: { params: eventIdParam },
  responses: {
    200: successResponse('Số liệu tổng hợp', feedbackSummarySchema),
    ...eventScopedErrors,
  },
});
