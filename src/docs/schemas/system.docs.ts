// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';

// data của GET /health (src/app.ts). Endpoint DUY NHẤT nằm ngoài tiền tố /api/v1.
export const healthResultSchema = registry.register(
  'HealthResult',
  z.object({
    status: z.literal('UP'),
    timestamp: z.string().openapi({ format: 'date-time' }),
  })
);
