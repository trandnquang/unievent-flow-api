import { emailWorker } from './email.worker';

// Điểm khởi động tiến trình worker nền (API.md mục 12, SRS mục 5.6) - chạy tách biệt
// với API bằng `npm run worker`, dùng chung mã nguồn nhưng không chung tiến trình.
//
// Worker sẽ bổ sung ở các giai đoạn sau (audit mục 4.3):
//   - processRegistration — FR-16, BR-51/88/89/93/99 (Nhóm 3)
//   - sendEventReminder   — FR-35, BR-58/97 (Nhóm 3)
// Các loại email khác (vé, nhắc lịch, mời co-host, cấp tài khoản Organizer) dùng lại
// hàng đợi 'email' sẵn có, chỉ cần thêm nhánh trong email.worker.ts.

const workers = [emailWorker];

console.log(`🛠️  Worker đang chạy: ${workers.map((w) => w.name).join(', ')}`);

// Tắt an toàn: chờ job đang chạy kết thúc trước khi thoát (Graceful Shutdown)
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang dừng worker...`);
  await Promise.all(workers.map((worker) => worker.close()));
  console.log('✅ Đã dừng toàn bộ worker.');
  process.exit(0);
};

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
