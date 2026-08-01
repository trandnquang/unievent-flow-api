// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse } from '../envelope';
import { unauthorized, forbidden, accountDisabled } from '../errors';
import { ticketIdParam } from '../helpers';
import {
  ticketDetailResultSchema,
  selfCheckinResultSchema,
} from '../schemas/ticket.docs';

const TAG = 'Tickets';

const ticketNotFound = errorResponse(
  'Không tìm thấy vé này — dùng 404 thay 403 để không lộ sự tồn tại vé của người khác',
  ['TICKET_NOT_FOUND']
);

// FR-18 — GET /tickets/:ticketId
registry.registerPath({
  method: 'get',
  path: '/tickets/{ticketId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Chi tiết vé kèm mã QR (FR-18)',
  description:
    'Owner-only GIÁN TIẾP qua `registrations.user_id`; vé của người khác → 404.\n\n' +
    'Ảnh QR là PNG base64 sinh TẠI CHỖ từ tickets.jwt_code, không gọi dịch vụ ngoài. ' +
    '⚠️ `jwt_code` KHÔNG BAO GIỜ xuất hiện dưới dạng field JSON (CLAUDE.md bất biến #7) — nó chỉ ' +
    'sống bên trong `qr_code_data_url`.\n\n' +
    '⭐ v1.1.0 — `ticket` bổ sung event_title, holder_name, checked_in_at và join_url. ' +
    '`join_url` CHỈ xuất hiện khi sự kiện là `online` (BR-107); vé `in_person` KHÔNG CÓ khoá này ' +
    'trong response (không phải null).',
  request: { params: ticketIdParam },
  responses: {
    200: successResponse('Chi tiết vé', ticketDetailResultSchema),
    401: unauthorized,
    403: accountDisabled,
    404: ticketNotFound,
  },
});

// FR-36 — POST /tickets/:ticketId/self-checkin
registry.registerPath({
  method: 'post',
  path: '/tickets/{ticketId}/self-checkin',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Sinh viên tự check-in sự kiện trực tuyến (FR-36)',
  description:
    'Chỉ role=student và chỉ chính chủ. **Request body RỖNG** — endpoint KHÔNG nhận field nào. ' +
    'BR-107: việc client mở `join_url` chính là hành vi kích hoạt lời gọi này; frontend chỉ có một nút ' +
    '"Vào phòng họp", bấm là vừa mở link vừa gọi endpoint. Server tự ghi `checkin_logs.checkin_time` — ' +
    'KHÔNG nhận mốc thời gian hay bằng chứng nào do client gửi lên.\n\n' +
    'Ghi `checkin_logs` với organizer_id = NULL, checkin_method = self (ràng buộc SQL ' +
    'chk_checkin_method_organizer, BR-66).\n\n' +
    'Bốn guard theo ĐÚNG thứ tự (v0.5.2, chốt): (1) ownership → 404 · (2) BR-65 sự kiện phải `online` → ' +
    '422 EVENT_NOT_ONLINE · (3) BR-95 cửa sổ [start−15p, end+30p] và event.status=active → ' +
    '422 SELF_CHECKIN_WINDOW_CLOSED · (4) trạng thái vé. Kiểm cửa sổ TRƯỚC trạng thái vé để sinh viên ' +
    'bấm ngoài giờ nhận đúng thông điệp "chưa tới giờ / đã đóng".\n\n' +
    '⚠️ Bấm "Vào lại phòng họp" KHÔNG gọi lại endpoint này (SRS §4.5.3); nếu vẫn bị gọi → 409.',
  request: { params: ticketIdParam },
  responses: {
    200: successResponse('Vé sau khi check-in', selfCheckinResultSchema),
    401: unauthorized,
    403: forbidden,
    404: ticketNotFound,
    409: errorResponse('Vé đã được check-in trước đó', ['ALREADY_CHECKED_IN']),
    422: errorResponse('Không thoả điều kiện tự check-in', [
      'EVENT_NOT_ONLINE',
      'SELF_CHECKIN_WINDOW_CLOSED',
      'TICKET_NOT_VALID',
    ]),
  },
});
