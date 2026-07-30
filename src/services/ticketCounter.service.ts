import { redis } from '../config/redis';
import {
  COUNTER_NOT_INITIALIZED,
  COUNTER_WOULD_GO_NEGATIVE,
} from '../redis/scripts';
import { AppError } from '../utils/errors';

// Bộ đếm vé còn lại trên Redis — nguồn sự thật real-time của tồn kho vé (SRS mục 5.2, BR-33).
// PostgreSQL chỉ giữ sổ cái để đối soát qua view v_event_registration_stats.
export const ticketCounterKey = (eventId: string): string =>
  `event:${eventId}:tickets`;

// Mã trả về của script decrementTicket (xem src/redis/scripts.ts)
const DECREMENT_OK = 1;
const DECREMENT_SOLD_OUT = 0;

export class TicketCounterService {
  // Khởi tạo bộ đếm khi tạo sự kiện (FR-08): vé còn lại ban đầu = max_tickets
  public static async initTicketCounter(
    eventId: string,
    maxTickets: number
  ): Promise<void> {
    await redis.set(ticketCounterKey(eventId), maxTickets);
  }

  // Đọc bộ đếm của nhiều sự kiện trong 1 lần gọi (BR-33) - dùng cho danh sách sự kiện.
  // Key không tồn tại trả về null để bên gọi tự quyết cách bù (fallback view PostgreSQL).
  public static async getRemainingMap(
    eventIds: string[]
  ): Promise<Record<string, number | null>> {
    if (eventIds.length === 0) return {};

    const values = await redis.mget(eventIds.map(ticketCounterKey));

    const map: Record<string, number | null> = {};
    eventIds.forEach((eventId, index) => {
      const raw = values[index];
      map[eventId] = raw === null || raw === undefined ? null : Number(raw);
    });
    return map;
  }

  // BR-47 (Atomic Decrement Rule): giữ 1 vé cho một request đăng ký.
  // Ném lỗi khi bộ đếm chưa tồn tại — đây là BUG KHỞI TẠO, không phải hết vé. Cố tình
  // KHÔNG tự khởi tạo lại counter ở đây: tự chữa cháy sẽ che giấu lỗi thật và có thể
  // phát vé vượt quá max_tickets nếu khởi tạo nhầm giá trị.
  public static async decrementTicket(
    eventId: string
  ): Promise<'ok' | 'sold_out'> {
    const result = await redis.decrementTicket(ticketCounterKey(eventId));

    if (result === DECREMENT_OK) return 'ok';
    if (result === DECREMENT_SOLD_OUT) return 'sold_out';

    console.error(
      `❌ [ERROR] Bộ đếm vé Redis ${ticketCounterKey(eventId)} không tồn tại khi đăng ký — kiểm tra lại bước khởi tạo ở FR-08`
    );
    throw new AppError(
      500,
      'INTERNAL_SERVER_ERROR',
      'Không thể xử lý đăng ký lúc này. Vui lòng thử lại sau.'
    );
  }

  // Hoàn 1 vé về bộ đếm (BR-89 khi xử lý thất bại, BR-56 khi sinh viên tự huỷ).
  // KHÔNG bọc Lua: INCR là lệnh đơn, tự thân đã nguyên tử trong Redis — không có bước
  // "đọc rồi mới ghi" như BR-47 nên không có race nào cần script giải quyết.
  public static async refundTicket(eventId: string): Promise<void> {
    await redis.incr(ticketCounterKey(eventId));
  }

  // Đồng bộ bộ đếm khi max_tickets thay đổi (FR-10, BR-90).
  // delta = max_tickets_mới − max_tickets_cũ. Trả về số vé còn lại sau khi cộng,
  // hoặc null nếu không thực hiện được (chưa khởi tạo / sẽ làm bộ đếm âm).
  public static async resyncTicketCounter(
    eventId: string,
    delta: number
  ): Promise<number | null> {
    const result = await redis.resyncTicketCounter(
      ticketCounterKey(eventId),
      String(delta)
    );

    if (result === COUNTER_NOT_INITIALIZED || result === COUNTER_WOULD_GO_NEGATIVE) {
      return null;
    }

    return result;
  }

  // Xoá bộ đếm (dùng khi cần dựng lại từ đầu). Sự kiện đã huỷ KHÔNG gọi hàm này —
  // BR-96: không hoàn vé, khoá đếm để tự hết hạn/bỏ qua.
  public static async deleteTicketCounter(eventId: string): Promise<void> {
    await redis.del(ticketCounterKey(eventId));
  }
}
