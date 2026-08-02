import app from './app';
import { env } from './config/env';
import { prisma } from './config/db';
import { pingRedis, disconnectRedis } from './config/redis';
import { TicketCounterService } from './services/ticketCounter.service';

const bootstrap = async () => {
  try {
    // Kiểm tra kết nối CSDL PostgreSQL qua Prisma
    await prisma.$connect();
    console.log('✅ Kết nối cơ sở dữ liệu PostgreSQL thành công');

    // Redis là phụ thuộc bắt buộc — không kết nối được thì dừng hẳn, không chạy tiếp
    await pingRedis();
    console.log('✅ Kết nối Redis thành công');

    // NFR-27: dựng lại bộ đếm vé bị thiếu TRƯỚC khi mở cổng, để không có cửa sổ thời gian
    // nào đăng ký bị 500 vì thiếu khoá đếm. Chỉ chạy ở tiến trình API — worker là tiến trình
    // riêng, cho chạy cả hai chỉ tạo hai lượt quét đua nhau mà không thêm giá trị.
    //
    // KHÔNG được chặn khởi động khi lỗi: đường đọc đã có fallback view
    // (EventService.getTicketsRemainingMap), API vẫn phục vụ được. Log ERROR rồi đi tiếp.
    try {
      await TicketCounterService.reconcileMissingCounters();
    } catch (error) {
      console.error(
        '❌ [ERROR] Không đối soát được bộ đếm vé Redis lúc khởi động:',
        error instanceof Error ? error.message : error
      );
    }

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 UniEvent Flow API đang chạy tại http://localhost:${env.PORT}`);
    });

    // Xử lý tắt ứng dụng an toàn (Graceful Shutdown)
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang đóng kết nối...`);
      server.close(async () => {
        await prisma.$disconnect();
        await disconnectRedis();
        console.log('✅ Đã ngắt kết nối CSDL, Redis và dừng server.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Lỗi khởi động ứng dụng:', error);
    await prisma.$disconnect();
    await disconnectRedis().catch(() => undefined);
    process.exit(1);
  }
};

bootstrap();
