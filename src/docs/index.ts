// Import ĐẦU TIÊN (xem zod-openapi.ts).
import './zod-openapi';
import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';

// Nạp các file path để chúng chạy registerPath vào registry dùng chung. Mỗi nhóm endpoint
// thêm đúng một dòng import ở đây. THỨ TỰ = thứ tự nhóm trong api_spec.md.
import './paths/auth.paths'; //          mục 2   Auth & Account
import './paths/organizer.paths'; //     mục 2   Organizers (FR-33/37)
import './paths/event.paths'; //         mục 3.1 Vòng đời sự kiện
import './paths/eventSchedule.paths'; // mục 3.2 Lịch trình
import './paths/eventUpdate.paths'; //   mục 3.3 Thông báo
import './paths/eventCoHost.paths'; //   mục 3.4 Co-host
import './paths/registration.paths'; //  mục 4 + 4b
import './paths/ticket.paths'; //        mục 4
import './paths/checkin.paths'; //       mục 5
import './paths/feedback.paths'; //      mục 6
import './paths/dashboard.paths'; //     mục 7
import './paths/admin.paths'; //         mục 8
import './paths/upload.paths'; //        mục 9
import './paths/system.paths'; //        GET /health (ngoài /api/v1)

// Sinh document một lần lúc khởi động — spec là hằng số sau khi mã nguồn đã nạp xong,
// không cần dựng lại mỗi request.
export const openApiDocument = new OpenApiGeneratorV3(
  registry.definitions
).generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'UniEvent Flow API',
    version: '1.0.0',
    description: [
      'Tài liệu sinh trực tiếp từ chính Zod schema dùng để validate request (api_spec.md mục 13),',
      'nên không thể lệch với hành vi thật của server.',
      '',
      '**Wire format: snake_case** cho toàn bộ field và wrapper key.',
      '',
      '**Envelope (mục 1.2)** — thành công: `{ success: true, data, meta? }`;',
      'lỗi: `{ success: false, error: { code, message, details? } }`.',
      'Frontend rẽ nhánh theo `error.code`, không parse `message`.',
      '',
      'Phạm vi: **toàn bộ 51 endpoint REST nghiệp vụ + `GET /health`** (api_spec.md mục 11).',
      '',
      '`GET /health` nằm NGOÀI tiền tố `/api/v1` nên operation của nó tự ghi đè `servers`.',
    ].join('\n'),
  },
  // Path đăng ký trong document KHÔNG kèm tiền tố — tiền tố nằm ở đây, đúng một chỗ.
  servers: [{ url: '/api/v1', description: 'Base URL (api_spec.md mục 1.1)' }],
  tags: [
    { name: 'Auth', description: 'Đăng ký, đăng nhập, mật khẩu — FR-01 → FR-04, FR-07' },
    { name: 'Account', description: 'Hồ sơ cá nhân, vé & phản hồi của tôi — FR-05, FR-06, FR-17, FR-42' },
    { name: 'Organizers', description: 'Tra cứu & hồ sơ công khai Ban tổ chức — FR-33, FR-37' },
    { name: 'Events', description: 'Vòng đời sự kiện — FR-08 → FR-13' },
    { name: 'Event Schedule', description: 'Lịch trình sự kiện — FR-32' },
    { name: 'Event Updates', description: 'Thông báo cập nhật sự kiện — FR-31' },
    { name: 'Co-hosts', description: 'Đơn vị đồng tổ chức — FR-37' },
    { name: 'Registrations', description: 'Đăng ký tham dự & danh sách người đăng ký — FR-14 → FR-16, FR-34, FR-41' },
    { name: 'Tickets', description: 'Vé điện tử & mã QR — FR-17, FR-18, FR-36' },
    { name: 'Check-in', description: 'Quét vé tại cổng & xuất CSV — FR-19 → FR-22' },
    { name: 'Feedback', description: 'Phản hồi & phân tích cảm xúc — FR-23 → FR-26' },
    { name: 'Dashboard', description: 'Số liệu tổng hợp sự kiện — FR-27, FR-28' },
    { name: 'Admin', description: 'Quản trị hệ thống — FR-29, FR-30, FR-38, FR-39' },
    { name: 'Uploads', description: 'Tải ảnh lên Cloudinary — FR-40' },
    { name: 'System', description: 'Health check — nằm NGOÀI tiền tố /api/v1' },
  ],
});

// Mount tài liệu ở HOST GỐC, ngoài tiền tố /api/v1 (giống GET /health):
//   GET /api-docs      -> Swagger UI
//   GET /api-docs.json -> spec thô cho `openapi-typescript` phía frontend
//
// Chỉ THÊM route mới, không đụng chuỗi middleware sẵn có.
export const mountApiDocs = (app: Express): void => {
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.status(200).json(openApiDocument);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'UniEvent Flow API — OpenAPI',
      swaggerOptions: { persistAuthorization: true },
    })
  );
};
