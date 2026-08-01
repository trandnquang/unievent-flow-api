// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import {
  successResponse,
  errorResponse,
  noContentResponse,
  listResponse,
} from '../envelope';
import {
  unauthorized,
  accountDisabled,
  validationError,
  rateLimited,
} from '../errors';
import { jsonBody } from '../helpers';
import { myFeedbackItemSchema, queryMyFeedbacksSchemaDocs } from '../schemas/feedback.docs';
import { myTicketItemSchema } from '../schemas/ticket.docs';
import { paginationQuerySchema } from '../schemas/common.docs';
import {
  registerBodySchema,
  loginBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  changePasswordBodySchema,
  updateProfileBodySchema,
  userResultSchema,
  loginResultSchema,
  messageResultSchema,
} from '../schemas/auth.docs';

// Nhóm Auth & Account — api_spec.md mục 2 (FR-01 → FR-07, FR-33).
//
// LƯU Ý VỀ ĐƯỜNG DẪN: đăng ký KHÔNG kèm tiền tố /api/v1 vì document đã khai
// `servers: [{ url: '/api/v1' }]` (src/docs/index.ts). baseURL phía frontend đã gồm /api/v1
// nên nếu ghi cả hai chỗ sẽ thành /api/v1/api/v1/....

const TAG_AUTH = 'Auth';
const TAG_ACCOUNT = 'Account';

// `jsonBody` và bốn const lỗi dùng chung đã chuyển sang ../helpers và ../errors khi số nhóm
// endpoint đi từ 1 lên 15 — import ở đầu file.

// FR-01 — POST /auth/register
registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: [TAG_AUTH],
  summary: 'Đăng ký tài khoản Sinh viên (FR-01)',
  description:
    'Server LUÔN gán cứng role=student. Tài khoản Ban tổ chức chỉ được cấp qua POST /admin/organizers (FR-38). Rate limit 3 lần/giờ/IP.',
  request: { body: jsonBody(registerBodySchema, 'Thông tin đăng ký') },
  responses: {
    201: successResponse('Tạo tài khoản thành công', userResultSchema),
    400: validationError,
    409: errorResponse('Email đã được đăng ký', ['EMAIL_ALREADY_EXISTS']),
    429: rateLimited,
  },
});

// FR-02 — POST /auth/login
registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: [TAG_AUTH],
  summary: 'Đăng nhập (FR-02)',
  description:
    'Trả access token dạng JWT. BR-07: sai email và sai mật khẩu dùng CHUNG mã INVALID_CREDENTIALS để không lộ email nào đã đăng ký. Rate limit 5 lần/phút/IP.',
  request: { body: jsonBody(loginBodySchema, 'Thông tin đăng nhập') },
  responses: {
    200: successResponse('Đăng nhập thành công', loginResultSchema),
    400: validationError,
    401: errorResponse('Email hoặc mật khẩu không chính xác (BR-07)', [
      'INVALID_CREDENTIALS',
    ]),
    403: errorResponse('Mật khẩu đúng nhưng tài khoản bị vô hiệu hoá (BR-08)', [
      'ACCOUNT_DISABLED',
    ]),
    429: rateLimited,
  },
});

// FR-03 — POST /auth/logout
registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: [TAG_AUTH],
  security: requiresAuth,
  summary: 'Đăng xuất (FR-03)',
  description:
    'JWT là stateless nên server không thu hồi token; client tự xoá. Trả 204, KHÔNG có body.',
  responses: {
    204: noContentResponse('Đăng xuất thành công, không có nội dung trả về'),
    401: unauthorized,
    403: accountDisabled,
  },
});

// FR-07 — POST /auth/forgot-password
registry.registerPath({
  method: 'post',
  path: '/auth/forgot-password',
  tags: [TAG_AUTH],
  summary: 'Yêu cầu khôi phục mật khẩu (FR-07)',
  description:
    'BR-22: LUÔN trả 202 dù email có tồn tại hay không, để không thể dùng endpoint này dò email đã đăng ký. Token khôi phục có hạn 20 phút và được gửi qua email bởi worker.',
  request: { body: jsonBody(forgotPasswordBodySchema, 'Email cần khôi phục') },
  responses: {
    202: successResponse(
      'Đã tiếp nhận yêu cầu (không xác nhận email có tồn tại)',
      messageResultSchema
    ),
    400: validationError,
  },
});

// FR-07 — POST /auth/reset-password
registry.registerPath({
  method: 'post',
  path: '/auth/reset-password',
  tags: [TAG_AUTH],
  summary: 'Đặt lại mật khẩu bằng token (FR-07)',
  description:
    'token là reset_token nhận qua email, dùng một lần và hết hạn sau 20 phút (BR-22).',
  request: {
    body: jsonBody(resetPasswordBodySchema, 'Token và mật khẩu mới'),
  },
  responses: {
    200: successResponse('Đặt lại mật khẩu thành công', messageResultSchema),
    400: errorResponse('Token không hợp lệ/hết hạn hoặc body sai định dạng', [
      'RESET_TOKEN_EXPIRED',
      'VALIDATION_ERROR',
    ]),
  },
});

// FR-04 — POST /auth/change-password
registry.registerPath({
  method: 'post',
  path: '/auth/change-password',
  tags: [TAG_AUTH],
  security: requiresAuth,
  summary: 'Đổi mật khẩu khi đã đăng nhập (FR-04)',
  description: 'NFR-08: mật khẩu mới được hash lại bằng bcrypt trước khi lưu.',
  request: {
    body: jsonBody(changePasswordBodySchema, 'Mật khẩu cũ và mật khẩu mới'),
  },
  responses: {
    200: successResponse('Đổi mật khẩu thành công', messageResultSchema),
    400: validationError,
    401: errorResponse('Chưa đăng nhập, hoặc mật khẩu cũ không chính xác', [
      'UNAUTHORIZED',
      'INVALID_CREDENTIALS',
    ]),
    403: accountDisabled,
    404: errorResponse('Không tìm thấy người dùng', ['USER_NOT_FOUND']),
  },
});

// FR-05 — GET /users/me
registry.registerPath({
  method: 'get',
  path: '/users/me',
  tags: [TAG_ACCOUNT],
  security: requiresAuth,
  summary: 'Xem thông tin cá nhân (FR-05)',
  responses: {
    200: successResponse('Thông tin người dùng hiện tại', userResultSchema),
    401: unauthorized,
    403: accountDisabled,
  },
});

// FR-06 — PATCH /users/me
registry.registerPath({
  method: 'patch',
  path: '/users/me',
  tags: [TAG_ACCOUNT],
  security: requiresAuth,
  summary: 'Cập nhật thông tin cá nhân (FR-06)',
  description:
    'BR-17: chỉ sửa được {name, avatar_url, bio, social_links, club_name}; KHÔNG sửa được email/role/password qua endpoint này. club_name chỉ có ý nghĩa với role=organizer — role khác gửi thì bị bỏ qua im lặng, không báo lỗi.',
  request: {
    body: jsonBody(updateProfileBodySchema, 'Các trường cần cập nhật'),
  },
  responses: {
    200: successResponse('Thông tin sau khi cập nhật', userResultSchema),
    400: validationError,
    401: unauthorized,
    403: accountDisabled,
  },
});

// FR-17 — GET /users/me/tickets
registry.registerPath({
  method: 'get',
  path: '/users/me/tickets',
  tags: [TAG_ACCOUNT],
  security: requiresAuth,
  summary: 'Danh sách vé của tôi (FR-17)',
  description:
    'Chỉ role=student. Mỗi item kèm registration_id, registration_status và `event` lồng bên trong. ' +
    'KHÔNG BAO GIỜ chứa tickets.jwt_code — chuỗi đó chỉ sống trong ảnh QR của GET /tickets/:ticketId.',
  request: { query: paginationQuerySchema },
  responses: {
    200: listResponse('Danh sách vé', 'tickets', myTicketItemSchema),
    401: unauthorized,
    403: accountDisabled,
  },
});

// FR-42 — GET /users/me/feedbacks
registry.registerPath({
  method: 'get',
  path: '/users/me/feedbacks',
  tags: [TAG_ACCOUNT],
  security: requiresAuth,
  summary: 'Phản hồi tôi đã gửi (FR-42)',
  description:
    'BR-122: chỉ đọc, lọc theo feedbacks.user_id = sub của JWT. Phục vụ màn "Phản hồi đã gửi" (SRS §4.6.3). ' +
    'Khác GET /events/:eventId/feedbacks (FR-24) vốn dành cho Ban tổ chức xem phản hồi của sự kiện mình.',
  request: { query: queryMyFeedbacksSchemaDocs },
  responses: {
    200: listResponse('Danh sách phản hồi đã gửi', 'feedbacks', myFeedbackItemSchema),
    401: unauthorized,
    403: accountDisabled,
  },
});
