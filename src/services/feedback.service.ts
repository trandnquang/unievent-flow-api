import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { feedbackQueue } from '../config/queues';
import {
  CreateFeedbackInput,
  QueryEventFeedbacksInput,
  QueryMyFeedbacksInput,
} from '../schemas/feedback.schema';
import { buildPaginationMeta, PaginationMeta } from '../schemas/common.schema';
import { AppError } from '../utils/errors';
import { SentimentService } from './sentiment.service';

export interface MyFeedbackItem {
  event_name: string;
  rating: number;
  content: string | null;
  created_at: Date;
}

export class FeedbackService {
  // Danh sách phản hồi do CHÍNH người dùng đăng nhập đã gửi (FR-42, BR-122).
  // Chỉ đọc - phản hồi đã gửi không sửa/không xoá; không bao giờ lộ phản hồi của người khác.
  public static async getMyFeedbacks(
    userId: string,
    query: QueryMyFeedbacksInput
  ): Promise<{
    feedbacks: MyFeedbackItem[];
    meta: PaginationMeta;
  }> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [feedbacks, total] = await Promise.all([
      prisma.feedbacks.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          rating: true,
          content: true,
          created_at: true,
          events: { select: { title: true } },
        },
      }),
      prisma.feedbacks.count({ where: { user_id: userId } }),
    ]);

    return {
      feedbacks: feedbacks.map((feedback) => ({
        event_name: feedback.events.title,
        rating: feedback.rating,
        content: feedback.content,
        created_at: feedback.created_at,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // ---------------------------------------------------------------- FR-23

  // Sinh viên gửi phản hồi cho sự kiện đã tham dự
  public static async createFeedback(
    eventId: string,
    userId: string,
    input: CreateFeedbackInput
  ) {
    // BR-67 (Attendance Condition Rule): chỉ nhận phản hồi khi có vé đã checked_in cho
    // chính sự kiện đó. Điều kiện này thoả bởi CẢ HAI luồng check-in — quét QR tại cổng
    // (FR-19/20) lẫn sinh viên tự xác nhận sự kiện online (FR-36).
    const ticket = await prisma.tickets.findFirst({
      where: {
        status: 'checked_in',
        registrations: { event_id: eventId, user_id: userId },
      },
      select: { id: true },
    });

    if (!ticket) {
      throw new AppError(
        422,
        'NOT_ATTENDED',
        'Bạn cần tham dự sự kiện trước khi gửi phản hồi.'
      );
    }

    try {
      return await prisma.feedbacks.create({
        data: {
          event_id: eventId,
          user_id: userId,
          ticket_id: ticket.id,
          rating: input.rating,
          content: input.content ?? null,
        },
      });
    } catch (error) {
      // BR-70 (One Feedback Per Ticket Rule): unique feedbacks.ticket_id. Bắt P2002 làm
      // lưới chắn race — hai lần bấm gửi đồng thời đều qua được bước kiểm tra ở trên.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppError(
          409,
          'DUPLICATE_FEEDBACK',
          'Bạn đã gửi phản hồi cho vé này rồi.'
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- FR-24

  // Danh sách phản hồi của một sự kiện (BR-71) - chỉ chủ sự kiện xem được
  public static async listEventFeedbacks(
    eventId: string,
    query: QueryEventFeedbacksInput
  ) {
    const { page, limit, sentiment } = query;
    const skip = (page - 1) * limit;

    const where = {
      event_id: eventId,
      ...(sentiment ? { sentiment_label: sentiment } : {}),
    };

    const [feedbacks, total] = await Promise.all([
      prisma.feedbacks.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          rating: true,
          content: true,
          sentiment_label: true,
          keywords: true,
          analyzed_at: true,
          created_at: true,
          users: { select: { id: true, name: true } },
        },
      }),
      prisma.feedbacks.count({ where }),
    ]);

    return {
      feedbacks: feedbacks.map(({ users, keywords, ...rest }) => ({
        ...rest,
        // Trả mảng cho FE thay vì chuỗi thô đã lưu trong cột TEXT
        keywords: SentimentService.parseKeywords(keywords),
        user: users,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // ---------------------------------------------------------------- FR-25/26

  // Kích hoạt phân tích cảm xúc (BR-73: chỉ thủ công, không có cron định kỳ).
  // Trả job_id ngay, việc gọi LLM nằm ở worker (SRS mục 5.6).
  public static async requestAnalysis(eventId: string): Promise<string> {
    const job = await feedbackQueue.add('analyze', {
      type: 'analyze',
      event_id: eventId,
    });

    return String(job.id);
  }

  // Lấy các phản hồi cần phân tích của một sự kiện (BR-72).
  // Điều kiện khớp đúng partial index idx_feedbacks_unanalyzed đã có sẵn trong schema:
  // content khác rỗng VÀ analyzed_at IS NULL. Phản hồi chỉ có rating được bỏ qua hoàn
  // toàn — không tốn token cho thứ không có gì để đọc.
  public static async findUnanalyzed(eventId: string) {
    return prisma.feedbacks.findMany({
      where: {
        event_id: eventId,
        analyzed_at: null,
        content: { not: null },
      },
      select: { id: true, content: true },
    });
  }

  // BR-74 (Persistence Rule): ghi kết quả phân tích
  public static async saveAnalysis(
    feedbackId: string,
    sentimentLabel: 'positive' | 'negative' | 'neutral',
    keywords: string[]
  ): Promise<void> {
    await prisma.feedbacks.update({
      where: { id: feedbackId },
      data: {
        sentiment_label: sentimentLabel,
        keywords: SentimentService.serializeKeywords(keywords),
        analyzed_at: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------- FR-28

  // Tổng hợp phản hồi của sự kiện. Dùng chung cho GET /feedbacks/summary và cho phần
  // `sentiment` của GET /dashboard — không viết lại truy vấn ở hai nơi.
  public static async getSummary(eventId: string) {
    const [grouped, aggregate, analyzed] = await Promise.all([
      prisma.feedbacks.groupBy({
        by: ['sentiment_label'],
        where: { event_id: eventId },
        _count: { _all: true },
      }),
      // BR-77 (Rating Average Rule): "Điểm phản hồi AI" là TRUNG BÌNH CỘNG THÔ của
      // feedbacks.rating trên TOÀN BỘ phản hồi đã gửi — tuyệt đối KHÔNG suy ra từ
      // sentiment_label (quyết định sản phẩm đã chốt).
      prisma.feedbacks.aggregate({
        where: { event_id: eventId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.feedbacks.findMany({
        where: { event_id: eventId, keywords: { not: null } },
        select: { keywords: true },
      }),
    ]);

    const breakdown = { positive: 0, negative: 0, neutral: 0 };
    for (const row of grouped) {
      if (row.sentiment_label) {
        breakdown[row.sentiment_label] = row._count._all;
      }
    }

    // Đếm tần suất từ khoá ở tầng ứng dụng: cột keywords là TEXT phân tách bằng dấu phẩy,
    // không phải mảng nên không gộp được bằng SQL thuần.
    const counter = new Map<string, number>();
    for (const row of analyzed) {
      for (const keyword of SentimentService.parseKeywords(row.keywords)) {
        counter.set(keyword, (counter.get(keyword) ?? 0) + 1);
      }
    }

    const topKeywords = [...counter.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    return {
      sentiment_breakdown: breakdown,
      top_keywords: topKeywords,
      // Làm tròn 2 chữ số để FE không phải xử lý số thực dài
      average_rating:
        aggregate._avg.rating === null
          ? null
          : Math.round(aggregate._avg.rating * 100) / 100,
      total_feedbacks: aggregate._count._all,
    };
  }
}
