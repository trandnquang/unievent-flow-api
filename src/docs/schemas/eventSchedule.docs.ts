// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  createEventScheduleSchema,
  updateEventScheduleSchema,
} from '../../schemas/eventSchedule.schema';
import { uuid, dateTime } from './common.docs';

// Xem chú thích về `z.coerce.date()` → `nullable: true` thừa ở event.docs.ts.
const dateTimeInput = (description: string) =>
  z.coerce.date().openapi({ type: 'string', format: 'date-time', description });

// BR-43b: mô tả dùng chung cho cả body tạo lẫn body sửa
const START_TIME_BOUND =
  'BR-43b: phải nằm trong `[event.start_time, event.end_time]` — BIÊN ĐÓNG, bằng đúng hai mốc ' +
  'là hợp lệ. Ngoài khoảng → 422 `SCHEDULE_TIME_OUT_OF_RANGE`.';

export const createScheduleItemBodySchema = registry.register(
  'CreateScheduleItemBody',
  createEventScheduleSchema.safeExtend({
    start_time: dateTimeInput(
      `Thời điểm bắt đầu mốc lịch trình, ISO-8601. ${START_TIME_BOUND}`
    ),
  })
);

export const updateScheduleItemBodySchema = registry.register(
  'UpdateScheduleItemBody',
  updateEventScheduleSchema.safeExtend({
    start_time: dateTimeInput(
      `Thời điểm bắt đầu mốc lịch trình. ${START_TIME_BOUND} Không gửi khoá này thì KHÔNG bị kiểm.`
    ).optional(),
  })
);

// Nguyên hàng `event_schedule` (FR-32, BR-43)
export const scheduleItemSchema = registry.register(
  'ScheduleItem',
  z.object({
    id: uuid(),
    event_id: uuid(),
    start_time: dateTime(),
    title: z.string().openapi({ example: 'Khai mạc & phát biểu chào mừng' }),
    location: z.string().nullable(),
    sort_order: z.number().int().openapi({
      description: 'BR-43: thứ tự hiển thị; danh sách luôn sắp theo cột này tăng dần.',
      example: 0,
    }),
    created_at: dateTime(),
  })
);
