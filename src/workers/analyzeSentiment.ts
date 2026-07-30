import { Job, Worker } from 'bullmq';
import { bullConnection } from '../config/bullmq';
import { FEEDBACK_QUEUE_NAME, FeedbackJobData } from '../config/queues';
import { FeedbackService } from '../services/feedback.service';
import { SentimentService } from '../services/sentiment.service';

// Worker phân tích cảm xúc phản hồi bằng LLM (FR-25/26, BR-72/74).
// Nằm ở tiến trình worker vì đây là tác vụ chậm phụ thuộc dịch vụ ngoài (SRS mục 5.6).
export const feedbackWorker = new Worker<FeedbackJobData>(
  FEEDBACK_QUEUE_NAME,
  async (job: Job<FeedbackJobData>) => {
    const { event_id } = job.data;

    // BR-72: chỉ lấy phản hồi CÓ nội dung và CHƯA phân tích. Chạy lại job lần hai trên
    // cùng sự kiện sẽ cho tập rỗng — không gọi LLM, không tốn token.
    const pending = await FeedbackService.findUnanalyzed(event_id);

    if (pending.length === 0) {
      console.log(
        `ℹ️  Sự kiện ${event_id} không còn phản hồi nào cần phân tích`
      );
      return;
    }

    const results = await SentimentService.analyze(
      pending.map((feedback) => ({
        id: feedback.id,
        content: feedback.content ?? '',
      }))
    );

    // BR-74: ghi tuần tự để một bản ghi lỗi không kéo đổ cả lô đã phân tích xong.
    // Phản hồi nào không ghi được vẫn giữ analyzed_at IS NULL nên lần chạy sau tự lấy lại.
    let saved = 0;
    for (const result of results) {
      try {
        await FeedbackService.saveAnalysis(
          result.id,
          result.sentiment_label,
          result.keywords
        );
        saved += 1;
      } catch (error) {
        console.error(
          `❌ [ERROR] Không lưu được kết quả phân tích cho phản hồi ${result.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(
      `🧠 Đã phân tích ${saved}/${pending.length} phản hồi của sự kiện ${event_id}`
    );
  },
  { connection: bullConnection }
);

feedbackWorker.on('failed', (job, error) => {
  console.error(
    `❌ Phân tích cảm xúc thất bại job ${job?.id ?? 'không rõ'} (lần thử ${job?.attemptsMade ?? 0}):`,
    error.message
  );
});
