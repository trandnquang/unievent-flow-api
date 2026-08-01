// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { z } from '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse, listResponse } from '../envelope';
import {
  unauthorized,
  forbidden,
  accountDisabled,
  eventScopedErrors,
} from '../errors';
import { eventIdParam, registrationIdParam } from '../helpers';
import {
  queryEventRegistrationsSchemaDocs,
  createRegistrationResultSchema,
  registrationDetailResultSchema,
  eventRegistrationItemSchema,
} from '../schemas/registration.docs';

const TAG = 'Registrations';

const registrationNotFound = errorResponse(
  'Không tìm thấy đăng ký này (dùng 404 thay 403 để không lộ sự tồn tại đăng ký của người khác)',
  ['REGISTRATION_NOT_FOUND']
);

// FR-14 — POST /events/:eventId/registrations
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/registrations',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Đăng ký tham dự sự kiện (FR-14)',
  description:
    'Chỉ role=student. KHÔNG có body. **Trả 202, không phải 200** (BR-50): vé được sinh bất đồng bộ ' +
    'bởi worker, frontend poll GET /registrations/:registrationId (khuyến nghị mỗi 2s, tối đa ~15s) ' +
    'cho tới khi status = confirmed (kèm `ticket`) hoặc failed.\n\n' +
    '⭐ v1.1.0 — body 202 có thêm `expires_at`, mốc TUYỆT ĐỐI hết hạn giữ chỗ, để đồng hồ đếm ngược ' +
    'ở màn M3-S03 sống sót qua việc tải lại trang.\n\n' +
    'Thứ tự guard (SRS §2.2.3): BR-87 kiểm sự kiện còn nhận đăng ký → BR-49 kiểm đăng ký trùng → ' +
    'giảm bộ đếm Redis nguyên tử → tạo registration. Hai bước đầu đặt TRƯỚC bước giảm đếm để request ' +
    'hỏng không trừ mất một vé.',
  request: {
    params: eventIdParam,
    headers: z.object({
      'Idempotency-Key': z.string().optional().openapi({
        description:
          'Tuỳ chọn (mục 1.7). Chống trùng request trong 30 giây; request trùng nhận lại kết quả của request GỐC thay vì tạo đăng ký thứ hai.',
      }),
    }),
  },
  responses: {
    202: successResponse(
      'Đã tiếp nhận — vé đang được sinh bất đồng bộ',
      createRegistrationResultSchema
    ),
    401: unauthorized,
    403: forbidden,
    404: errorResponse('Không tìm thấy sự kiện', ['EVENT_NOT_FOUND']),
    409: errorResponse('Hết vé, hoặc đã đăng ký sự kiện này rồi', [
      'SOLD_OUT',
      'DUPLICATE_REGISTRATION',
    ]),
    422: errorResponse(
      'Sự kiện đã bị huỷ hoặc đã bắt đầu, không nhận đăng ký (BR-87)',
      ['EVENT_NOT_REGISTRABLE']
    ),
  },
});

// FR-41 — GET /events/:eventId/registrations
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/registrations',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Danh sách người đăng ký (FR-41)',
  description:
    'Chủ sự kiện HOẶC Co-host đã accepted (BR-113). `search` khớp một phần trên `name`, không phân biệt hoa thường.\n\n' +
    '⚠️ Response chứa `email` — dữ liệu cá nhân (BR-114). Cùng với GET /admin/users, đây là MỘT TRONG HAI ' +
    'nơi duy nhất API trả email của người khác; tuyệt đối không nới quyền endpoint này xuống public.\n\n' +
    '⭐ v1.1.0 — thêm `checkin_method` và `checked_in_at` lấy qua LEFT JOIN registrations → tickets → ' +
    'checkin_logs, để tab "Người tham gia & Check-in" phân biệt được người quét QR tại cổng với người ' +
    'tự check-in online, và hiển thị được giờ vào.',
  request: {
    params: eventIdParam,
    query: queryEventRegistrationsSchemaDocs,
  },
  responses: {
    200: listResponse(
      'Danh sách người đăng ký',
      'items',
      eventRegistrationItemSchema
    ),
    ...eventScopedErrors,
  },
});

// FR-15/16 — GET /registrations/:registrationId
registry.registerPath({
  method: 'get',
  path: '/registrations/{registrationId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Trạng thái xử lý đăng ký (FR-15/16)',
  description:
    'Endpoint POLLING của luồng bất đồng bộ. Owner-only theo `registrations.user_id` (KHÔNG phải organizer). ' +
    '`ticket` chỉ xuất hiện khi status = confirmed. status = failed là GIÁ TRỊ NGHIỆP VỤ trong body 200 ' +
    '(frontend hiển thị MSG-43), không phải lỗi HTTP.',
  request: { params: registrationIdParam },
  responses: {
    200: successResponse('Trạng thái đăng ký', registrationDetailResultSchema),
    401: unauthorized,
    403: accountDisabled,
    404: registrationNotFound,
  },
});

// FR-34 — POST /registrations/:registrationId/cancel
registry.registerPath({
  method: 'post',
  path: '/registrations/{registrationId}/cancel',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Tự huỷ đăng ký (FR-34)',
  description:
    'Chỉ role=student và chỉ chính chủ. BR-55: chỉ huỷ được khi status = confirmed và vé còn `valid`. ' +
    'BR-56: registration và ticket đổi trạng thái trong CÙNG một transaction; vé chỉ được hoàn về bộ đếm ' +
    'Redis SAU KHI transaction commit thành công.',
  request: { params: registrationIdParam },
  responses: {
    200: successResponse(
      'Đăng ký và vé sau khi huỷ',
      registrationDetailResultSchema
    ),
    401: unauthorized,
    403: forbidden,
    404: registrationNotFound,
    422: errorResponse('Không ở trạng thái huỷ được', [
      'REGISTRATION_NOT_CANCELLABLE',
      'CANNOT_CANCEL_CHECKED_IN_TICKET',
    ]),
  },
});
