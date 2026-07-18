import { z } from 'zod';

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
    category: z
      .string()
      .max(100, 'Thể loại tối đa 100 ký tự')
      .optional(),
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
    category: z
      .string()
      .max(100, 'Thể loại tối đa 100 ký tự')
      .optional(),
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
export const queryEventsSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  club_name: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().default('-created_at'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type QueryEventsInput = z.infer<typeof queryEventsSchema>;
