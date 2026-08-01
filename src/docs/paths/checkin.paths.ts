// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { z } from '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse, listResponse } from '../envelope';
import { validationError, rateLimited, eventScopedErrors } from '../errors';
import { jsonBody, eventIdParam } from '../helpers';
import {
  scanCheckinBodySchema,
  queryCheckinsSchemaDocs,
  scanResultSchema,
  checkinItemSchema,
  checkinSummarySchema,
} from '../schemas/checkin.docs';

const TAG = 'Check-in';

// FR-19/20 — POST /events/:eventId/checkin/scan
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/checkin/scan',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Quét mã QR tại cổng (FR-19/20)',
  description:
    'Chủ sự kiện HOẶC Co-host đã accepted (BR-63). Xác thực chữ ký JWT + kiểm `exp` (BR-99), ' +
    'trả kết quả ĐỒNG BỘ trong <1s.\n\n' +
    '⚠️ Luôn HTTP **200** cho một request kỹ thuật hợp lệ — kết quả nghiệp vụ nằm ở `data.result`. ' +
    'Nhờ vậy organizer UI phân biệt được vé dùng lại / vé giả / vé thuộc sự kiện khác / vé hết hạn ' +
    'thay vì chỉ thấy một mã HTTP chung.\n\n' +
    'BR-91: trước khi trả kết quả, đặt khoá `SET checkin:{ticketId} NX EX 86400` trên Redis để chốt ' +
    'nguyên tử — hai lần quét cùng một vé chỉ MỘT lần nhận `valid`. Việc ghi `checkin_logs` và đổi ' +
    '`tickets.status` chạy BẤT ĐỒNG BỘ sau khi đã trả response (BR-62); ghi thất bại sau retry thì ' +
    'khoá được giải phóng để quét lại (BR-94).\n\n' +
    'CHỈ áp dụng cho sự kiện `in_person` (BR-60) — sự kiện `online` trả 422 EVENT_NOT_IN_PERSON.',
  request: {
    params: eventIdParam,
    body: jsonBody(scanCheckinBodySchema, 'Nội dung đọc được từ mã QR'),
  },
  responses: {
    200: successResponse(
      'Kết quả quét (đọc `result` để rẽ nhánh màn hình)',
      scanResultSchema
    ),
    400: validationError,
    ...eventScopedErrors,
    422: errorResponse('Sự kiện trực tuyến không dùng luồng quét QR (BR-60)', [
      'EVENT_NOT_IN_PERSON',
    ]),
    429: rateLimited,
  },
});

// FR-21 — GET /events/:eventId/checkins
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/checkins',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Lịch sử check-in (FR-21)',
  description:
    'Chủ sự kiện HOẶC Co-host đã accepted. Mỗi item kèm `checkin_method` để phân biệt quét tại cổng ' +
    'với sinh viên tự check-in online.\n\n' +
    '⭐ v1.1.0 — thêm `summary { confirmed, checked_in }`: bộ đếm "đã vào / tổng" cho màn quét QR ' +
    '(M2-S01/M2-S02). Có mặt ở đây vì GET /events/:eventId/dashboard là owner-only trong khi endpoint ' +
    'này là owner-or-cohost — không có nó thì Co-host không hiển thị được bộ đếm, hoặc phải tự cộng dồn ' +
    'theo trang (sai ngay khi có phân trang).\n\n' +
    '⚠️ Hai con số trong `summary` là tổng của TOÀN SỰ KIỆN, độc lập với page/limit — khác với ' +
    '`meta.pagination.total` vốn là số bản ghi checkin_logs của danh sách đang phân trang.',
  request: { params: eventIdParam, query: queryCheckinsSchemaDocs },
  responses: {
    200: listResponse('Lịch sử check-in', 'items', checkinItemSchema, {
      extra: { summary: checkinSummarySchema },
    }),
    ...eventScopedErrors,
  },
});

// FR-22 — GET /events/:eventId/checkins/export
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/checkins/export',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Xuất CSV lịch sử check-in (FR-22, BR-64)',
  description:
    'Chủ sự kiện HOẶC Co-host đã accepted. ⚠️ ENDPOINT DUY NHẤT không dùng envelope JSON của mục 1.2 — ' +
    'trả thẳng nội dung CSV, không lưu file trung gian.\n\n' +
    'Định dạng chốt v1.0.0 — RFC 4180 kèm BOM UTF-8: (a) mở đầu bằng BOM `EF BB BF`, không có nó thì ' +
    'Excel trên Windows đọc như ANSI và làm vỡ toàn bộ tiếng Việt; (b) MỌI ô đều bọc nháy kép, kể cả ô ' +
    'không chứa ký tự đặc biệt; (c) nháy kép bên trong ô được nhân đôi; (d) xuống dòng CRLF. ' +
    'Cột: `Ho ten, Email, Ma ve, Thoi diem check-in, Hinh thuc, Nguoi quet`.\n\n' +
    '⚠️ Frontend: endpoint yêu cầu header `Authorization` nên KHÔNG dùng được `<a download>` hay ' +
    '`window.open()` — trình duyệt điều hướng bằng một request riêng không mang theo header, kết quả là ' +
    '401 chứ không phải file. Phải dùng `fetch()` rồi tạo Blob. Ngoài ra `fetch().text()` TỰ BÓC BOM ' +
    'theo thuật toán UTF-8 decode của WHATWG — muốn kiểm tra BOM phải đọc `arrayBuffer()`.',
  request: { params: eventIdParam },
  responses: {
    200: {
      description: 'Nội dung CSV (KHÔNG phải envelope JSON)',
      headers: z.object({
        'Content-Disposition': z.string().openapi({
          example: 'attachment; filename="checkins-<eventId>.csv"',
        }),
      }),
      content: {
        'text/csv': {
          schema: z.string().openapi({
            format: 'binary',
            example:
              '"Ho ten","Email","Ma ve","Thoi diem check-in","Hinh thuc","Nguoi quet"',
          }),
        },
      },
    },
    ...eventScopedErrors,
  },
});
