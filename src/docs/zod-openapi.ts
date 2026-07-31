import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Vá prototype của Zod để có `.openapi()` — PHẢI chạy đúng MỘT LẦN và TRƯỚC mọi lời gọi
// `.openapi()` trong repo. Gom vào module riêng vì thứ tự import là thứ quyết định:
// mọi file trong src/docs/ import file này ĐẦU TIÊN, và src/app.ts cũng import nó ở dòng
// đầu để bảo đảm thứ tự kể cả khi cây import đổi về sau.
extendZodWithOpenApi(z);

export { z };
