import { z } from 'zod';
import { paginationSchema } from './common.schema';

// Body quét vé tại cổng (FR-19/20). Chuỗi JWT đọc được từ mã QR.
// LƯU Ý: eventId nằm trên đường dẫn (/events/:eventId/checkin/scan) chứ không ở body —
// requireOwnerOrCoHost cần nó ở params, và BR-59 cần nó để so với event_id trong vé.
export const scanCheckinSchema = z.object({
  qr_token: z
    .string({ error: 'Thiếu mã vé' })
    .min(1, 'Mã vé không được để trống'),
});

// Danh sách lịch sử check-in (FR-21) - phân trang chuẩn API.md mục 1.5
export const queryCheckinsSchema = paginationSchema;

export type ScanCheckinInput = z.infer<typeof scanCheckinSchema>;
export type QueryCheckinsInput = z.infer<typeof queryCheckinsSchema>;
