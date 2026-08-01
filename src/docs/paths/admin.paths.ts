// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse, listResponse } from '../envelope';
import { unauthorized, forbidden, validationError } from '../errors';
import { jsonBody, userIdParam, eventIdParam } from '../helpers';
import {
  updateUserStatusBodySchema,
  createOrganizerBodySchema,
  queryAdminUsersSchemaDocs,
  queryAdminEventsSchemaDocs,
  adminUserItemSchema,
  adminEventItemSchema,
  adminUserResultSchema,
  adminEventResultSchema,
  createOrganizerResultSchema,
} from '../schemas/admin.docs';
import { cancelEventBodySchema } from '../schemas/event.docs';

const TAG = 'Admin';

// Mọi endpoint trong file này đều qua requireRole('admin') ở tầng router.
const adminErrors = {
  401: unauthorized,
  403: forbidden,
};

// FR-39 — GET /admin/users
registry.registerPath({
  method: 'get',
  path: '/admin/users',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Tra cứu người dùng toàn hệ thống (FR-39)',
  description:
    'CHỈ role=admin. BR-101: `search` khớp một phần trên `name` HOẶC `email`, không phân biệt hoa thường.\n\n' +
    '⚠️ Response chứa `email`. Cùng với GET /events/:eventId/registrations (FR-41), đây là MỘT TRONG HAI ' +
    'nơi duy nhất API trả email của người khác. BR-100: `select` tường minh ở tầng CSDL đảm bảo ' +
    'password_hash và reset_token không thể lọt ra.\n\n' +
    'BR-102: `is_self` để giao diện khoá nút thao tác trên chính admin đang đăng nhập.',
  request: { query: queryAdminUsersSchemaDocs },
  responses: {
    200: listResponse('Danh sách người dùng', 'users', adminUserItemSchema),
    ...adminErrors,
  },
});

// FR-39 — GET /admin/events
registry.registerPath({
  method: 'get',
  path: '/admin/events',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Tra cứu sự kiện toàn hệ thống (FR-39)',
  description:
    'CHỈ role=admin. BR-103: KHÔNG lọc mặc định theo `status` — trả sự kiện ở MỌI trạng thái, gồm cả ' +
    '`cancelled`. Đây là khác biệt then chốt so với GET /events công khai (chỉ trả `active`).\n\n' +
    'BR-110: mỗi item kèm `organizer` (tên/email BTC) và `issued_tickets`, để admin đánh giá mức ảnh hưởng ' +
    'trước khi buộc huỷ.',
  request: { query: queryAdminEventsSchemaDocs },
  responses: {
    200: listResponse('Danh sách sự kiện', 'events', adminEventItemSchema),
    ...adminErrors,
  },
});

// FR-29 — PATCH /admin/users/:userId/status
registry.registerPath({
  method: 'patch',
  path: '/admin/users/{userId}/status',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Bật/tắt tài khoản người dùng (FR-29)',
  description:
    'CHỈ role=admin. Đặt `users.is_active`. Việc thu hồi quyền có hiệu lực từ request KẾ TIẾP: ' +
    'middleware requireActive cache trạng thái trên Redis khoá `active:{userId}` TTL 60s, và endpoint này ' +
    'XOÁ cache ngay khi đổi (độ trễ tối đa 60s nếu xoá cache thất bại) — thay vì phải chờ access token ' +
    'hết hạn tối đa 2 giờ.\n\n' +
    'BR-102: admin không tự vô hiệu hoá chính mình.',
  request: {
    params: userIdParam,
    body: jsonBody(updateUserStatusBodySchema, 'Trạng thái mới'),
  },
  responses: {
    200: successResponse('Người dùng sau khi đổi trạng thái', adminUserResultSchema),
    400: validationError,
    ...adminErrors,
    404: errorResponse('Không tìm thấy người dùng', ['USER_NOT_FOUND']),
    422: errorResponse('Admin không thể tự vô hiệu hoá chính mình (BR-102)', [
      'CANNOT_DISABLE_SELF',
    ]),
  },
});

// FR-30 — POST /admin/events/:eventId/force-cancel
registry.registerPath({
  method: 'post',
  path: '/admin/events/{eventId}/force-cancel',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Buộc huỷ sự kiện (FR-30)',
  description:
    'CHỈ role=admin. BR-96 — khác POST /events/:eventId/cancel (FR-13) ở ĐÚNG HAI điểm: ' +
    '(1) KHÔNG bị chặn bởi BR-37b, tức huỷ được cả sự kiện đang diễn ra hoặc đã kết thúc, vì vi phạm ' +
    'chính sách thường chỉ lộ ra SAU khi sự kiện đã bắt đầu (BR-96a); (2) `cancelled_by` là adminId ' +
    'thay vì chủ sự kiện.\n\n' +
    'Phần cascade (huỷ vé, gửi email) dùng CHUNG EventService.applyCancellation với FR-13, để hai luồng ' +
    'không trôi khỏi nhau.',
  request: {
    params: eventIdParam,
    // BR-106: dùng CHUNG cancelEventSchema với FR-13 để hai luồng huỷ nhất quán.
    body: jsonBody(cancelEventBodySchema, 'Lý do buộc huỷ (10-500 ký tự)'),
  },
  responses: {
    200: successResponse('Sự kiện sau khi buộc huỷ', adminEventResultSchema),
    ...adminErrors,
    404: errorResponse('Không tìm thấy sự kiện', ['EVENT_NOT_FOUND']),
    // BR-106: lý do thiếu/sai độ dài trả 422 với mã RIÊNG, không phải 400 VALIDATION_ERROR
    422: errorResponse('Lý do huỷ không hợp lệ (BR-106)', [
      'CANCEL_REASON_REQUIRED',
    ]),
  },
});

// FR-38 — POST /admin/organizers
registry.registerPath({
  method: 'post',
  path: '/admin/organizers',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Cấp phát tài khoản Ban tổ chức (FR-38)',
  description:
    'CHỈ role=admin. Đây là con đường DUY NHẤT tạo được `role=organizer` — đăng ký công khai ' +
    '(POST /auth/register) luôn gán cứng `student`, và `organizer_code` đã bị loại bỏ hoàn toàn từ v0.3.0.\n\n' +
    '⚠️ Mật khẩu tạm KHÔNG nằm trong response: server sinh ngẫu nhiên, hash bằng bcrypt rồi gửi thẳng ' +
    'qua email cho tài khoản mới.',
  request: {
    body: jsonBody(createOrganizerBodySchema, 'Thông tin Ban tổ chức'),
  },
  responses: {
    201: successResponse('Tài khoản vừa cấp phát', createOrganizerResultSchema),
    400: validationError,
    ...adminErrors,
    409: errorResponse('Email đã được đăng ký', ['EMAIL_ALREADY_EXISTS']),
  },
});
