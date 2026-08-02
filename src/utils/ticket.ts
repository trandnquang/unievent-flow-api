import { $Enums } from '../../generated/prisma/client';

// Hình dạng DUY NHẤT của object `ticket` được phép ra JSON (BR-109).
export interface SafeTicket {
  id: string;
  status: $Enums.ticket_status;
  issued_at: Date;
}

// Chỉ cần đủ các cột an toàn — nhận cả hàng `tickets` đầy đủ lẫn hàng đã `select` sẵn.
type TicketLike = SafeTicket & Record<string, unknown>;

// Dùng ở `select`/`include` của Prisma để jwt_code không được nạp lên bộ nhớ ngay từ
// truy vấn. Phòng vệ hai lớp: kể cả khi ai đó quên gọi sanitizeTicket ở bước serialize.
export const SAFE_TICKET_SELECT = {
  id: true,
  status: true,
  issued_at: true,
} as const;

// tickets.jwt_code là CREDENTIAL của mã QR check-in, KHÔNG BAO GIỜ được trả ra JSON:
// nó chỉ sống trong ảnh QR (`qr_code_data_url`) và trong ảnh đính kèm email (BR-51).
// Lộ ra JSON là biến một credential chỉ-quét-được thành chuỗi copy/paste và chia sẻ được.
//
// ⚠️ LIỆT KÊ TƯỜNG MINH, TUYỆT ĐỐI KHÔNG dùng `const { jwt_code, ...rest } = ticket`:
// cách loại-trừ chỉ cần thêm một cột mới vào bảng `tickets` là âm thầm rò cột đó ra ngoài,
// còn cách liệt kê thì cột mới mặc định không lộ (xem CLAUDE.md, bất biến #7).
export const sanitizeTicket = (ticket: TicketLike): SafeTicket => ({
  id: ticket.id,
  status: ticket.status,
  issued_at: ticket.issued_at,
});
