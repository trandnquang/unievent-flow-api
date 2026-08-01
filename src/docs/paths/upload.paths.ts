// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse } from '../envelope';
import { unauthorized, accountDisabled, rateLimited } from '../errors';
import { multipartFileBody } from '../helpers';
import { uploadResultSchema } from '../schemas/upload.docs';

// FR-40 — POST /uploads/image
registry.registerPath({
  method: 'post',
  path: '/uploads/image',
  tags: ['Uploads'],
  security: requiresAuth,
  summary: 'Tải ảnh lên (FR-40)',
  description:
    'BR-105: MỌI role đã đăng nhập đều gọi được — sinh viên đổi avatar, Ban tổ chức đặt ảnh bìa sự kiện. ' +
    'Không giới hạn theo vai trò.\n\n' +
    'BR-104: chỉ JPG/PNG/WEBP, kiểm HAI lớp — MIME do client khai báo VÀ magic bytes ở đầu tệp, ' +
    'để đổi đuôi tệp không qua mặt được.\n\n' +
    'BR-111: server KHÔNG lưu tệp nhị phân (multer dùng memoryStorage, đẩy thẳng lên Cloudinary). ' +
    'Endpoint CHỈ trả URL — việc gán URL đó vào `cover_image` / `avatar_url` là một request RIÊNG.\n\n' +
    'Rate limit 10 lần/giờ/tài khoản để endpoint không thành nơi lưu trữ miễn phí.',
  request: {
    body: multipartFileBody(
      'Tệp ảnh, gửi dưới dạng multipart/form-data',
      'Tệp ảnh JPG/PNG/WEBP. Tên field PHẢI là `file`. Tối đa MAX_UPLOAD_SIZE_MB (mặc định 5 MB).'
    ),
  },
  responses: {
    201: successResponse('Tải lên thành công', uploadResultSchema),
    400: errorResponse('Không có tệp, hoặc sai tên field (phải là `file`)', [
      'BAD_REQUEST',
    ]),
    401: unauthorized,
    403: accountDisabled,
    413: errorResponse('Tệp vượt quá MAX_UPLOAD_SIZE_MB (BR-104)', [
      'FILE_TOO_LARGE',
    ]),
    422: errorResponse(
      'Định dạng không hỗ trợ, hoặc nội dung tệp không khớp MIME đã khai (BR-104)',
      ['INVALID_FILE_TYPE']
    ),
    429: rateLimited,
    502: errorResponse(
      'Cloudinary chưa cấu hình hoặc lỗi — KHÔNG bản ghi nào được tạo trong CSDL (BR-111, MSG-48)',
      ['UPLOAD_FAILED']
    ),
  },
});
