// Import ĐẦU TIÊN (xem zod-openapi.ts).
import './zod-openapi';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import { errorResponse } from './envelope';

// Các mục response lỗi lặp lại ở HÀNG CHỤC endpoint. Gom về một chỗ để 52 lời gọi
// registerPath không mỗi nơi mô tả một kiểu — và để sửa câu chữ một lần là đổi khắp tài liệu.
//
// Bốn const đầu vốn nằm trong paths/auth.paths.ts; chuyển ra đây khi số nhóm endpoint đi từ
// 1 lên 15.

export const unauthorized = errorResponse('Chưa đăng nhập hoặc token hết hạn', [
  'UNAUTHORIZED',
]);

export const accountDisabled = errorResponse(
  'Tài khoản đã bị vô hiệu hoá (FR-29)',
  ['ACCOUNT_DISABLED']
);

// 403 gom HAI nguyên nhân vì OpenAPI chỉ cho phép MỘT mục cho mỗi mã trạng thái:
//   requireActive                        -> ACCOUNT_DISABLED (FR-29)
//   requireRole / requireOwnerOnly / ... -> FORBIDDEN
export const forbidden = errorResponse(
  'Tài khoản đã bị vô hiệu hoá, hoặc không đủ quyền với tài nguyên này',
  ['ACCOUNT_DISABLED', 'FORBIDDEN']
);

export const validationError = errorResponse('Dữ liệu đầu vào không hợp lệ', [
  'VALIDATION_ERROR',
]);

export const rateLimited = errorResponse('Vượt rate limit (mục 1.6)', [
  'TOO_MANY_REQUESTS',
]);

export const eventNotFound = errorResponse('Không tìm thấy sự kiện', [
  'EVENT_NOT_FOUND',
]);

export const badPathParam = errorResponse(
  'Thiếu hoặc sai tham số trên đường dẫn',
  ['BAD_REQUEST']
);

// === Tổ hợp: spread thẳng vào `responses` của registerPath ====================

// requireAuth + requireActive (mục 1.4) — dùng cho endpoint KHÔNG kiểm quyền sở hữu.
export const authErrors: Record<string, ResponseConfig> = {
  401: unauthorized,
  403: accountDisabled,
};

// requireAuth + requireActive + requireRole (+ requireOwnerOnly / requireOwnerOrCoHost).
// 404 EVENT_NOT_FOUND đến từ chính hai middleware kiểm quyền sở hữu, không phải từ handler.
export const eventScopedErrors: Record<string, ResponseConfig> = {
  401: unauthorized,
  403: forbidden,
  404: eventNotFound,
};
