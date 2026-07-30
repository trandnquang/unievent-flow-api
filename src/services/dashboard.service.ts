import { prisma } from '../config/db';
import { TicketCounterService } from './ticketCounter.service';
import { FeedbackService } from './feedback.service';

interface RegistrationStatsRow {
  confirmed_count: bigint;
  pending_count: bigint;
  checked_in_count: bigint;
  tickets_remaining_db: bigint;
}

export class DashboardService {
  // Dashboard sự kiện (FR-27/28, BR-77): gộp 2 nhóm số liệu trong 1 lần gọi để giao diện
  // không phải ghép từ nhiều endpoint.
  public static async getEventDashboard(eventId: string) {
    const [statsRows, remainingMap, sentiment] = await Promise.all([
      // View v_event_registration_stats KHÔNG được khai báo trong prisma/schema.prisma
      // (thiếu previewFeatures = ["views"]) nên bắt buộc dùng $queryRaw.
      prisma.$queryRaw<RegistrationStatsRow[]>`
        SELECT confirmed_count, pending_count, checked_in_count, tickets_remaining_db
        FROM v_event_registration_stats
        WHERE event_id = ${eventId}::uuid
      `,
      // `remaining` đọc từ Redis — đây mới là nguồn thật mà luồng đăng ký đang trừ/hoàn
      // (BR-33/BR-47). Cột tickets_remaining_db của view chỉ để đối soát.
      TicketCounterService.getRemainingMap([eventId]),
      // Gọi lại đúng service của GET /feedbacks/summary, không viết lại truy vấn
      FeedbackService.getSummary(eventId),
    ]);

    const stats = statsRows[0];
    const confirmed = Number(stats?.confirmed_count ?? 0);
    const pending = Number(stats?.pending_count ?? 0);
    const checkedIn = Number(stats?.checked_in_count ?? 0);
    const remainingFromRedis = remainingMap[eventId];

    return {
      registrations: {
        // `total` = số đăng ký đang CHIẾM CHỖ (confirmed + pending), cùng cách đếm với
        // registered_count công khai ở BR-33b để hai màn hình không lệch nhau.
        total: confirmed + pending,
        confirmed,
        checked_in: checkedIn,
        remaining:
          remainingFromRedis ?? Number(stats?.tickets_remaining_db ?? 0),
      },
      sentiment: {
        breakdown: sentiment.sentiment_breakdown,
        top_keywords: sentiment.top_keywords,
        // BR-77: trung bình cộng thô của rating, KHÔNG suy từ sentiment_label
        average_rating: sentiment.average_rating,
        total_feedbacks: sentiment.total_feedbacks,
      },
    };
  }
}
