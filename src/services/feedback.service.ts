import { prisma } from '../config/db';
import { QueryMyFeedbacksInput } from '../schemas/feedback.schema';

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
    meta: {
      pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    };
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
      meta: {
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      },
    };
  }
}
