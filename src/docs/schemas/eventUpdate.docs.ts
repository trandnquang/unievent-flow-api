// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  createEventUpdateSchema,
  updateEventUpdateSchema,
  queryEventUpdatesSchema,
} from '../../schemas/eventUpdate.schema';
import { uuid, dateTime } from './common.docs';

export const createEventUpdateBodySchema = registry.register(
  'CreateEventUpdateBody',
  createEventUpdateSchema
);

export const updateEventUpdateBodySchema = registry.register(
  'UpdateEventUpdateBody',
  updateEventUpdateSchema
);

export const queryEventUpdatesSchemaDocs = registry.register(
  'QueryEventUpdates',
  queryEventUpdatesSchema
);

// Nguyên hàng `event_updates` (FR-31, BR-40)
export const eventUpdateSchema = registry.register(
  'EventUpdate',
  z.object({
    id: uuid(),
    event_id: uuid(),
    organizer_id: uuid().openapi({
      description:
        'Người đăng thông báo — có thể là chủ sự kiện HOẶC một Co-host đã accepted (BR-40).',
    }),
    title: z.string(),
    content: z.string(),
    created_at: dateTime(),
  })
);
