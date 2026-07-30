import { emailWorker } from './email.worker';
import { registrationWorker } from './processRegistration';
import { reminderWorker } from './sendEventReminder';
import { checkinWorker } from './writeCheckinLog';
import { feedbackWorker } from './analyzeSentiment';

// Điểm khởi động tiến trình worker nền (API.md mục 12, SRS mục 5.6) - chạy tách biệt
// với API bằng `npm run worker`, dùng chung mã nguồn nhưng không chung tiến trình.
//
//   - emailWorker        — hàng đợi 'email': đặt lại mật khẩu, thông báo sự kiện,
//                          mời co-host, xác nhận vé (thêm nhánh mới trong email.worker.ts)
//   - registrationWorker — hàng đợi 'registration': sinh vé (FR-16, BR-51/99) và bù trừ
//                          khi quá hạn giữ chỗ (BR-88/89/93)
//   - reminderWorker     — hàng đợi 'reminder': nhắc lịch trước sự kiện (FR-35, BR-58)
//   - checkinWorker      — hàng đợi 'checkin': ghi checkin_logs bất đồng bộ (BR-62/94)
//   - feedbackWorker     — hàng đợi 'feedback': phân tích cảm xúc bằng LLM (FR-25/26)

const workers = [
  emailWorker,
  registrationWorker,
  reminderWorker,
  checkinWorker,
  feedbackWorker,
];

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
