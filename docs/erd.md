# UniEvent Flow — Entity Relationship Diagram

_Cập nhật theo phạm vi 37 FR (xem SRS v0.3.1 mục 2.1)._
_Phiên bản: 0.2.0._
_Nguồn tham chiếu để xây dựng `SCHEMA.sql`._

So với bản gốc (6 bảng), sơ đồ dưới đây bổ sung:

- `users`: cột `avatar_url`, `bio`, `social_links` (JSONB); vai trò `admin` thêm vào `role`.
- `events`: cột `location_type` (`in_person` | `online`), `join_url`.
- `feedbacks`: cột `rating` (bắt buộc); `content` chuyển thành nullable.
- `checkin_logs`: cột `checkin_method` (`qr_scan` | `self`); `organizer_id` chuyển thành nullable.
- 3 bảng mới: `event_schedule`, `event_updates`, `event_co_hosts`.

```mermaid
erDiagram
    USER {
        uuid id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar role "student | organizer | admin"
        varchar avatar_url
        varchar bio
        jsonb social_links
        boolean is_active
        varchar reset_token
        timestamp reset_token_expires
        timestamp created_at
        timestamp updated_at
    }

    EVENT {
        uuid id PK
        uuid organizer_id FK
        varchar title
        text description
        varchar cover_image
        varchar location
        varchar location_type "in_person | online"
        varchar join_url
        varchar category
        varchar club_name
        timestamp start_time
        timestamp end_time
        int max_tickets
        varchar status "active | cancelled"
        timestamp created_at
        timestamp updated_at
    }

    EVENT_SCHEDULE {
        uuid id PK
        uuid event_id FK
        timestamp start_time
        varchar title
        varchar location
        int sort_order
        timestamp created_at
    }

    EVENT_UPDATE {
        uuid id PK
        uuid event_id FK
        uuid organizer_id FK
        varchar title
        text content
        timestamp created_at
    }

    EVENT_CO_HOST {
        uuid event_id FK
        uuid user_id FK
        timestamp added_at
    }

    REGISTRATION {
        uuid id PK
        uuid event_id FK
        uuid user_id FK
        varchar status "pending | confirmed | failed"
        timestamp requested_at
        timestamp processed_at
    }

    TICKET {
        uuid id PK
        uuid registration_id FK
        text jwt_code
        varchar status "valid | checked_in | cancelled"
        timestamp issued_at
    }

    FEEDBACK {
        uuid id PK
        uuid event_id FK
        uuid user_id FK
        uuid ticket_id FK
        smallint rating "1 to 5, bắt buộc"
        text content "tuỳ chọn (nullable)"
        varchar sentiment_label "positive | negative | neutral"
        text keywords
        timestamp analyzed_at
        timestamp created_at
    }

    CHECKIN_LOG {
        uuid id PK
        uuid ticket_id FK
        uuid organizer_id FK "nullable nếu tự check-in"
        varchar checkin_method "qr_scan | self"
        timestamp checkin_time
    }

    USER ||--o{ EVENT           : "tổ chức (organizer)"
    USER ||--o{ REGISTRATION    : "đăng ký (student)"
    USER ||--o{ FEEDBACK        : "gửi (student)"
    USER ||--o{ CHECKIN_LOG     : "thực hiện quét (organizer)"
    USER ||--o{ EVENT_UPDATE    : "đăng thông báo (organizer)"
    USER ||--o{ EVENT_CO_HOST   : "đồng hành (organizer)"
    EVENT ||--o{ REGISTRATION   : "nhận đăng ký"
    EVENT ||--o{ FEEDBACK       : "nhận phản hồi"
    EVENT ||--o{ EVENT_SCHEDULE : "có lịch trình"
    EVENT ||--o{ EVENT_UPDATE   : "có thông báo"
    EVENT ||--o{ EVENT_CO_HOST  : "có CLB đồng hành"
    REGISTRATION ||--o| TICKET      : "sinh vé (nếu confirmed)"
    TICKET       ||--o| CHECKIN_LOG : "được quét (nếu đã check-in)"
    TICKET       ||--o| FEEDBACK    : "xác minh đã tham dự"
```

## Ghi chú thiết kế

- **`event_co_hosts`** thuần liên kết hiển thị, không có cột quyền hạn (BR-46 trong SRS). Ràng buộc "`user_id` phải có `role = organizer`" được kiểm tra ở tầng service, không ràng buộc được bằng `CHECK` cấp CSDL (Postgres không cho `CHECK` tham chiếu bảng khác mà không dùng trigger).
- **`checkin_logs.organizer_id`** nullable: `NULL` khi `checkin_method = 'self'` (sinh viên tự check-in sự kiện online — FR-36); bắt buộc khi `checkin_method = 'qr_scan'`. Ràng buộc này được thêm ở cấp `CHECK` trong `SCHEMA.sql` (`chk_checkin_method_organizer`).
- **`events.location`** / **`events.join_url`**: bắt buộc có giá trị tuỳ theo `location_type` — ràng buộc `chk_event_location_fields` trong `SCHEMA.sql` thực thi điều này ở tầng CSDL (bổ sung so với bản nháp thay đổi ban đầu, vốn chỉ định nghĩa ở tầng service).
- **`tickets_remaining`** (số vé còn lại) không phải cột trong bảng `events` — nguồn dữ liệu thật là bộ đếm trên Redis, khởi tạo bằng `max_tickets` khi tạo sự kiện. View `v_event_registration_stats` trong `SCHEMA.sql` chỉ dùng để đối soát định kỳ, không thay thế Redis.
