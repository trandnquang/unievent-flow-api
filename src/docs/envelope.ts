// Import ĐẦU TIÊN (xem zod-openapi.ts).
import { z } from './zod-openapi';
import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import type { ZodType } from 'zod';
import { registry } from './registry';

// Envelope chuẩn api_spec.md mục 1.2. Gom vào một chỗ để 50 endpoint không mỗi nơi mô tả một
// kiểu — client FE unwrap `.data` đúng một lần cho mọi lời gọi.

// Khối meta.pagination — hình dạng lấy từ PaginationMeta ở src/schemas/common.schema.ts
// (page, limit, total, total_pages). Nhóm auth không dùng, nhưng các nhóm list sau sẽ cần.
const paginationMetaSchema = registry.register(
  'PaginationMeta',
  z
    .object({
      pagination: z.object({
        page: z.number().int().openapi({ example: 1 }),
        limit: z.number().int().openapi({ example: 20 }),
        total: z.number().int().openapi({ example: 57 }),
        total_pages: z.number().int().openapi({ example: 3 }),
      }),
    })
    .openapi({
      description:
        'Chỉ xuất hiện ở endpoint có phân trang (api_spec.md mục 1.2).',
    })
);

interface SuccessEnvelopeOptions {
  /** Endpoint danh sách: kèm khối meta.pagination bắt buộc */
  withPagination?: boolean;
}

// Bọc schema `data` vào envelope thành công: { success: true, data, meta? }
export const successEnvelope = <T extends ZodType>(
  dataSchema: T,
  options: SuccessEnvelopeOptions = {}
) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    ...(options.withPagination ? { meta: paginationMetaSchema } : {}),
  });

// Envelope lỗi: { success: false, error: { code, message, details? } }.
// Hình dạng khớp đúng src/middlewares/error.middleware.ts — `details` chỉ được điền bởi
// ZodError và parseOrCode (src/utils/validation.ts), luôn là mảng { path, message }.
export const errorEnvelopeSchema = registry.register(
  'ErrorEnvelope',
  z
    .object({
      success: z.literal(false),
      error: z.object({
        code: z.string().openapi({
          description:
            'Mã lỗi SCREAMING_SNAKE_CASE, ổn định qua thời gian — frontend rẽ nhánh theo mã này, không parse message.',
          example: 'INVALID_CREDENTIALS',
        }),
        message: z.string().openapi({
          description: 'Thông báo tiếng Việt hiển thị cho người dùng.',
        }),
        details: z
          .array(
            z.object({
              path: z.string().openapi({ example: 'email' }),
              message: z.string().openapi({ example: 'Email là bắt buộc' }),
            })
          )
          .optional()
          .openapi({
            description:
              'Chỉ có ở lỗi validate (VALIDATION_ERROR và các mã riêng do parseOrCode sinh ra).',
          }),
      }),
    })
    .openapi({ description: 'Envelope lỗi chuẩn api_spec.md mục 1.2.' })
);

// Dựng một mục response thành công cho registerPath.
export const successResponse = <T extends ZodType>(
  description: string,
  dataSchema: T,
  options: SuccessEnvelopeOptions = {}
): ResponseConfig => ({
  description,
  content: {
    'application/json': { schema: successEnvelope(dataSchema, options) },
  },
});

// Dựng một mục response lỗi cho registerPath. `codes` chỉ để mô tả cho người đọc Swagger UI —
// hình dạng body luôn là ErrorEnvelope.
export const errorResponse = (
  description: string,
  codes?: string[]
): ResponseConfig => ({
  description: codes?.length ? `${description} — ${codes.join(' · ')}` : description,
  content: {
    'application/json': { schema: errorEnvelopeSchema },
  },
});

// Response 204 không có body (POST /auth/logout).
export const noContentResponse = (description: string): ResponseConfig => ({
  description,
});
