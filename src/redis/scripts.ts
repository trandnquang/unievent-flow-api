// Toàn bộ Lua script chạy trên Redis, gom về một chỗ và nạp qua redis.defineCommand
// ở config/redis.ts. Nhúng dạng chuỗi TypeScript thay vì file .lua rời vì `npm run build`
// chỉ chạy `tsc` — file .lua sẽ không được copy sang dist/ và tiến trình production sẽ chết.

// Mã trả về dùng chung cho các script bộ đếm vé (số âm = không thực hiện được)
export const COUNTER_NOT_INITIALIZED = -2;
export const COUNTER_WOULD_GO_NEGATIVE = -1;

// BR-47 (Atomic Decrement Rule): kiểm tra còn vé và giảm 1 trong ĐÚNG một lệnh gọi
// nguyên tử. Tách thành 2 lệnh (GET rồi DECR) sẽ để lọt race giữa các request đồng thời —
// đây chính là gốc của lỗi oversell mà cả module này sinh ra để chống.
//
// Trả về: 1 = giảm thành công · 0 = hết vé · -1 = bộ đếm chưa tồn tại
// Lưu ý: -1 ở đây KHÁC nghĩa với COUNTER_WOULD_GO_NEGATIVE của script resync bên dưới;
// mỗi script có bảng mã riêng, service gọi chịu trách nhiệm diễn giải.
export const DECREMENT_TICKET = `
local current = redis.call('GET', KEYS[1])
if not current then
  return -1
end
current = tonumber(current)
if current <= 0 then
  return 0
end
redis.call('DECR', KEYS[1])
return 1
`;

// BR-90 (Ticket Counter Resync Rule): kiểm tra ràng buộc và INCRBY phải nằm trong CÙNG
// một script để nguyên tử với các request đăng ký chạy song song (cùng kỹ thuật BR-47).
// Nếu tách 2 lệnh, một luồng đăng ký chen vào giữa có thể đẩy bộ đếm xuống âm.
//
// Trả về: giá trị vé còn lại sau khi cộng · -2 = chưa khởi tạo · -1 = sẽ làm bộ đếm âm
export const RESYNC_TICKET_COUNTER = `
local current = redis.call('GET', KEYS[1])
if current == false then
  return ${COUNTER_NOT_INITIALIZED}
end
local delta = tonumber(ARGV[1])
if tonumber(current) + delta < 0 then
  return ${COUNTER_WOULD_GO_NEGATIVE}
end
return redis.call('INCRBY', KEYS[1], delta)
`;
