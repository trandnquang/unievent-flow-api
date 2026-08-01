// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';

// data của POST /uploads/image (FR-40, BR-111).
// App KHÔNG lưu tệp nhị phân — chỉ trả URL Cloudinary; việc gán URL đó vào
// events.cover_image / users.avatar_url là một request RIÊNG.
export const uploadResultSchema = registry.register(
  'UploadResult',
  z.object({
    url: z.url().openapi({
      description: 'secure_url do Cloudinary trả về.',
      example:
        'https://res.cloudinary.com/demo/image/upload/v1/unievent/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg',
    }),
  })
);
