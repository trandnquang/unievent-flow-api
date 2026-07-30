import { z } from 'zod';
import { paginationSchema } from './common.schema';

// BR-28b: category phải thuộc đúng 9 giá trị của ENUM event_category trong SCHEMA v0.4.1.
// Chặn ở tầng Zod (400 VALIDATION_ERROR) thay vì để CSDL từ chối (500 không kiểm soát).
export const eventCategorySchema = z.enum(
  [
    'academic',
    'competition',
    'seminar_workshop',
    'career',
    'volunteer',
    'arts_entertainment',
    'sports',
    'orientation',
    'other',
  ],
  { error: 'Thể loại sự kiện không thuộc danh mục cho phép' }
);

// Schema tạo mới sự kiện (FR-08) - Kiểm tra ràng buộc end_time > start_time và max_tickets > 0
export const createEventSchema = z
  .object({
    title: z
      .string({ error: 'Tiêu đề sự kiện là bắt buộc' })
      .min(1, 'Tiêu đề không được để trống')
      .max(255, 'Tiêu đề tối đa 255 ký tự'),
    description: z.string().optional(),
    cover_image: z
      .string()
      .max(500, 'Link ảnh tối đa 500 ký tự')
      .optional(),
    location: z
      .string()
      .max(255, 'Địa điểm tối đa 255 ký tự')
      .optional(),
    // FR-08 (BR-30): in_person -> location bắt buộc | online -> join_url bắt buộc
    location_type: z.enum(['in_person', 'online'], {
      error: 'Hình thức tổ chức phải là in_person hoặc online',
    }),
    join_url: z
      .string()
      .max(500, 'Đường dẫn tham gia tối đa 500 ký tự')
      .optional(),
    category: eventCategorySchema.optional(),
    club_name: z
      .string()
      .max(150, 'Tên câu lạc bộ tối đa 150 ký tự')
      .optional(),
    start_time: z.coerce.date({
      error: 'Thời gian bắt đầu là bắt buộc và phải đúng định dạng ngày tháng',
    }),
    end_time: z.coerce.date({
      error: 'Thời gian kết thúc là bắt buộc và phải đúng định dạng ngày tháng',
    }),
    max_tickets: z.coerce
      .number({ error: 'Số lượng vé tối đa là bắt buộc' })
      .int('Số vé phải là số nguyên')
      .positive('Số vé tối đa phải lớn hơn 0'),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
    path: ['end_time'],
  })
  // BR-30 / MSG-21: location bắt buộc khi in_person, chặn ngay ở Zod thay vì để rơi
  // xuống ràng buộc CSDL chk_event_location_fields (tránh lỗi 500 không kiểm soát)
  .refine(
    (data) =>
      data.location_type !== 'in_person' ||
      (!!data.location && data.location.trim().length > 0),
    {
      message:
        'Vui lòng nhập địa điểm tổ chức (sự kiện trực tiếp) hoặc đường dẫn tham gia (sự kiện trực tuyến).',
      path: ['location'],
    }
  )
  // BR-30 / MSG-21: join_url bắt buộc khi online
  .refine(
    (data) =>
      data.location_type !== 'online' ||
      (!!data.join_url && data.join_url.trim().length > 0),
    {
      message:
        'Vui lòng nhập địa điểm tổ chức (sự kiện trực tiếp) hoặc đường dẫn tham gia (sự kiện trực tuyến).',
      path: ['join_url'],
    }
  );

// Schema cập nhật sự kiện (FR-10)
export const updateEventSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Tiêu đề không được để trống')
      .max(255, 'Tiêu đề tối đa 255 ký tự')
      .optional(),
    description: z.string().optional(),
    cover_image: z
      .string()
      .max(500, 'Link ảnh tối đa 500 ký tự')
      .optional(),
    location: z
      .string()
      .max(255, 'Địa điểm tối đa 255 ký tự')
      .optional(),
    // FR-10 (BR-30): partial update — ràng buộc chéo location_type/location/join_url
    // với dữ liệu hiện có được kiểm tra ở EventService.updateEvent (cần đọc bản ghi cũ)
    location_type: z
      .enum(['in_person', 'online'], {
        error: 'Hình thức tổ chức phải là in_person hoặc online',
      })
      .optional(),
    join_url: z
      .string()
      .max(500, 'Đường dẫn tham gia tối đa 500 ký tự')
      .optional(),
    category: eventCategorySchema.optional(),
    club_name: z
      .string()
      .max(150, 'Tên câu lạc bộ tối đa 150 ký tự')
      .optional(),
    start_time: z.coerce.date().optional(),
    end_time: z.coerce.date().optional(),
    max_tickets: z.coerce
      .number()
      .int('Số vé phải là số nguyên')
      .positive('Số vé tối đa phải lớn hơn 0')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.start_time && data.end_time) {
        return data.end_time > data.start_time;
      }
      return true;
    },
    {
      message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
      path: ['end_time'],
    }
  );

// Schema lọc & phân trang danh sách sự kiện (FR-13)
export const queryEventsSchema = paginationSchema.extend({
  q: z.string().optional(),
  // BR-28b: lọc so khớp CHÍNH XÁC giá trị ENUM, không phải chuỗi con tự do.
  // Nếu để z.string() thì ?category=abc rơi xuống Prisma và sinh 500 thay vì 400.
  category: eventCategorySchema.optional(),
  club_name: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().default('-created_at'),
});

// Schema phân trang danh sách sự kiện của chính organizer (FR-12) - phân trang chỉ áp cho
// nhánh `owned`; `co_hosting` và `pending_invitations` luôn trả đủ để FE dựng banner lời mời
export const queryMyEventsSchema = paginationSchema;

// FR-11 (BR-106 + quyết định M3): lý do huỷ là BẮT BUỘC, 10-500 ký tự, giống FR-30.
// Vi phạm trả 422 (không phải 400 Zod mặc định) - xem utils/validation.ts parseOr422.
export const cancelEventSchema = z.object({
  reason: z
    .string({ error: 'Vui lòng nhập lý do huỷ sự kiện' })
    .trim()
    .min(10, 'Lý do huỷ phải có ít nhất 10 ký tự')
    .max(500, 'Lý do huỷ tối đa 500 ký tự'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type QueryEventsInput = z.infer<typeof queryEventsSchema>;
export type QueryMyEventsInput = z.infer<typeof queryMyEventsSchema>;
export type CancelEventInput = z.infer<typeof cancelEventSchema>;
