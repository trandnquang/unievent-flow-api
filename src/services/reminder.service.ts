import { env } from '../config/env';
import { reminderJobId, reminderQueue } from '../config/queues';

// Vòng đời job nhắc lịch trước sự kiện (FR-35, BR-57 + BR-97).
//
// Đây là phần PRODUCER: lên lịch khi tạo sự kiện (FR-08), huỷ + lên lịch lại khi
// start_time đổi (FR-10), huỷ khi sự kiện chuyển cancelled (FR-11/FR-30).
//
// TODO [Nhóm 3 / FR-35]: viết worker tiêu thụ hàng đợi này (src/workers/sendEventReminder.ts).
// BR-58: worker phải truy vấn danh sách người nhận (registrations.status = 'confirmed')
// TẠI THỜI ĐIỂM JOB CHẠY, không phải lúc lên lịch — nhờ vậy người đã huỷ đăng ký hoặc
// đăng ký thất bại tự rơi khỏi danh sách, và sự kiện đã cancelled cho tập rỗng.
export class ReminderService {
  // BR-57: job chạy tại mốc start_time trừ N giờ (N cấu hình qua REMINDER_LEAD_TIME_HOURS)
  private static computeDelayMs(startTime: Date): number {
    const leadTimeMs = env.REMINDER_LEAD_TIME_HOURS * 60 * 60 * 1000;
    return startTime.getTime() - leadTimeMs - Date.now();
  }

  // Lên lịch job nhắc lịch cho sự kiện. Mốc nhắc đã trôi qua (sự kiện tạo sát giờ hoặc
  // dời lịch vào quá gần) -> không lên lịch, đúng tinh thần "nhắc TRƯỚC sự kiện".
  public static async scheduleEventReminder(
    eventId: string,
    startTime: Date
  ): Promise<void> {
    const delay = this.computeDelayMs(startTime);
    if (delay <= 0) return;

    await reminderQueue.add(
      'event_reminder',
      { event_id: eventId },
      { jobId: reminderJobId(eventId), delay }
    );
  }

  // Huỷ job còn treo theo jobId cố định (BR-97). Job đã chạy/không tồn tại thì remove()
  // không ném lỗi — không cần kiểm tra tồn tại trước.
  public static async cancelEventReminder(eventId: string): Promise<void> {
    await reminderQueue.remove(reminderJobId(eventId));
  }

  // BR-97 + NFR-21: thao tác vòng đời job KHÔNG được làm hỏng response nghiệp vụ đã ghi
  // xuống PostgreSQL. Thất bại chỉ ghi log mức WARN; BR-58 là lớp phòng vệ cuối (job chạy
  // nhầm cũng không gửi được email vì danh sách người nhận truy vấn lúc chạy).
  public static async safeReschedule(
    eventId: string,
    startTime: Date
  ): Promise<void> {
    try {
      await this.cancelEventReminder(eventId);
      await this.scheduleEventReminder(eventId, startTime);
    } catch (error) {
      console.warn(
        `⚠️  [WARN] Không lên lịch lại được job nhắc lịch ${reminderJobId(eventId)}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  public static async safeCancel(eventId: string): Promise<void> {
    try {
      await this.cancelEventReminder(eventId);
    } catch (error) {
      console.warn(
        `⚠️  [WARN] Không huỷ được job nhắc lịch ${reminderJobId(eventId)}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  public static async safeSchedule(
    eventId: string,
    startTime: Date
  ): Promise<void> {
    try {
      await this.scheduleEventReminder(eventId, startTime);
    } catch (error) {
      console.warn(
        `⚠️  [WARN] Không lên lịch được job nhắc lịch ${reminderJobId(eventId)}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}
