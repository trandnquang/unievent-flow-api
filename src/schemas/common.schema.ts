import { z } from 'zod';

// Chuẩn phân trang dùng chung cho mọi list endpoint (API.md mục 1.5: ?page=1&limit=20).
// Gom về một chỗ để không endpoint nào tự parse thủ công — GET /events/mine từng dùng
// Number(req.query.page) nên ?page=abc sinh NaN rồi vỡ ở tầng Prisma (500 thay vì 400).
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface PaginationMeta {
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// Dựng khối meta.pagination theo đúng envelope API.md mục 1.2
export const buildPaginationMeta = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => ({
  pagination: {
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
  },
});
