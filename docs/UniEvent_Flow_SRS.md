# ĐẶC TẢ YÊU CẦU PHẦN MỀM
(Software Requirements Specification – SRS)
**UniEvent Flow**
*Nền tảng Đặt lịch Sự kiện & Quản lý Check-in Học đường*

## Thông tin

| Yếu tố | Nội dung |
| :--- | :--- |
| **Phiên bản tài liệu** | 1.0 |
| **Ngày phát hành** | 10/07/2026 |
| **Quy mô nhóm** | 2 thành viên |
| **Hạn nộp đề cương/đồ án** | 22/08/2026 |
| **Thời lượng thực hiện** | 7 tuần (04/07 – 22/08/2026) |
| **Trạng thái** | Bản nháp nền tảng — dùng để định hình & thống nhất phạm vi dự án |

> **Ghi chú:** Tài liệu này đã được rà soát tính khả thi (feasibility check) cho quy mô 2 người / 7 tuần. Các mục có nhãn MVP là bắt buộc phải hoàn thành; Should và Could là các phần mở rộng, chỉ làm nếu còn thời gian.

---

## Mục lục
1. [Giới thiệu](#1-giới-thiệu)
2. [Mô tả tổng quan](#2-mô-tả-tổng-quan)
3. [Yêu cầu chức năng (Functional Requirements)](#3-yêu-cầu-chức-năng-functional-requirements)
4. [Yêu cầu phi chức năng (Non-Functional Requirements)](#4-yêu-cầu-phi-chức-năng-non-functional-requirements)
5. [Kiến trúc hệ thống đề xuất](#5-kiến-trúc-hệ-thống-đề-xuất)
6. [Yêu cầu dữ liệu](#6-yêu-cầu-dữ-liệu)
7. [Yêu cầu giao diện ngoài (External Interfaces)](#7-yêu-cầu-giao-diện-ngoài-external-interfaces)
8. [Ma trận Use Case tóm tắt](#8-ma-trận-use-case-tóm-tắt)
9. [Kế hoạch triển khai 7 tuần](#9-kế-hoạch-triển-khai-7-tuần)
10. [Rủi ro & Giải pháp giảm thiểu](#10-rủi-ro--giải-pháp-giảm-thiểu)
11. [Tiêu chí nghiệm thu cho bản demo (Definition of Done)](#11-tiêu-chí-nghiệm-thu-cho-bản-demo-definition-of-done)

---

## 1. Giới thiệu

### 1.1 Mục đích tài liệu
Tài liệu này đặc tả toàn bộ phạm vi, yêu cầu chức năng, yêu cầu phi chức năng, kiến trúc kỹ thuật và kế hoạch triển khai của hệ thống UniEvent Flow. Mục tiêu là tạo ra một nền tảng thông tin thống nhất, dùng làm cơ sở cho việc lập kế hoạch, phân công công việc, thiết kế kỹ thuật và bảo vệ đề cương/đồ án của nhóm 2 thành viên trong 7 tuần thực hiện.

Bản đặc tả ban đầu của đề tài có một số điểm rủi ro về mặt khối lượng công việc (ví dụ: huấn luyện mô hình BERT riêng, triển khai đồng thời Redis lẫn RabbitMQ/Kafka). Tài liệu này đã điều chỉnh các điểm đó để đảm bảo dự án vẫn giữ được độ "khó" và tính thuyết phục về mặt kỹ thuật khi bảo vệ, nhưng nằm trong khả năng hoàn thành thực tế của 2 người trong 7 tuần.

### 1.2 Phạm vi dự án
**Trong phạm vi (In-scope):**
* Website quản lý & đăng ký sự kiện học đường với hai giao diện: Sinh viên tham dự và Ban tổ chức.
* Cơ chế đăng ký vé chống bán vượt số lượng (oversell) khi có lượng truy cập đồng thời lớn.
* Vé điện tử dạng mã QR mã hoá bằng JWT, xác thực nhanh tại thời điểm check-in.
* Module phân tích cảm xúc phản hồi sau sự kiện bằng LLM API (Prompt Engineering).
* Dashboard thống kê cơ bản cho ban tổ chức.

**Ngoài phạm vi (Out-of-scope, không làm trong 7 tuần này):**
* Huấn luyện/tinh chỉnh (fine-tune) mô hình học máy riêng (BERT hoặc tương đương).
* Thanh toán vé có phí, tích hợp cổng thanh toán.
* Ứng dụng di động (mobile app) riêng biệt — chỉ dùng web responsive, quét QR qua camera trình duyệt.
* Hệ thống thông báo đẩy (push notification) thời gian thực.
* Đa ngôn ngữ (i18n) và phân quyền chi tiết nhiều cấp bậc quản trị.

### 1.3 Đối tượng sử dụng tài liệu
* Hai thành viên trong nhóm phát triển — dùng để thống nhất phạm vi và phân công.
* Giảng viên hướng dẫn — dùng để đánh giá tính khả thi và định hướng ban đầu.
* Hội đồng phản biện/bảo vệ — dùng để tham chiếu khi đặt câu hỏi kỹ thuật.

### 1.4 Định nghĩa & từ viết tắt

| Thuật ngữ | Giải thích |
| :--- | :--- |
| **SRS** | Software Requirements Specification – Đặc tả yêu cầu phần mềm |
| **MVP** | Minimum Viable Product – Tập tính năng tối thiểu phải có để hệ thống chạy được và demo được |
| **FR / NFR** | Functional Requirement / Non-Functional Requirement – Yêu cầu chức năng / phi chức năng |
| **JWT** | JSON Web Token – Chuẩn mã hoá thông tin dạng chuỗi, có thể tự xác thực không cần tra cứu CSDL |
| **QR Code** | Quick Response Code – Mã vạch ma trận dùng để lưu và quét dữ liệu (ở đây là mã vé đã mã hoá JWT) |
| **LLM** | Large Language Model – Mô hình ngôn ngữ lớn (ví dụ Gemini, GPT), được gọi qua API thay vì tự huấn luyện |
| **Queue (Hàng đợi)** | Cơ chế xử lý bất đồng bộ, đẩy tác vụ nặng (gửi email, ghi log) ra khỏi luồng chính của server |
| **TTL** | Time To Live – Thời gian tồn tại của một bản ghi giữ chỗ tạm trong Redis trước khi tự hết hạn |
| **ERD** | Entity Relationship Diagram – Sơ đồ quan hệ thực thể trong thiết kế cơ sở dữ liệu |

---

## 2. Mô tả tổng quan

### 2.1 Bối cảnh & vấn đề cần giải quyết
Các câu lạc bộ, tổ chức và phòng ban sinh viên hiện tổ chức rất nhiều sự kiện mỗi năm, nhưng công tác truyền thông và đăng ký thường rời rạc qua mạng xã hội và Google Forms. Cách làm này tạo ra hai lỗ hổng chính: 
1. Không kiểm soát được sức chứa sự kiện theo thời gian thực, dẫn tới nhận đăng ký vượt số lượng chỗ; 
2. Không có công cụ theo dõi người tham dự thực tế (check-in) lẫn phân tích phản hồi sau sự kiện một cách có hệ thống.

### 2.2 Tầm nhìn sản phẩm
UniEvent Flow là nền tảng quản lý sự kiện học đường theo mô hình từ gốc đến ngọn: từ tạo sự kiện, đăng ký, phát vé điện tử, check-in tại cổng, cho đến thu thập và phân tích phản hồi sau sự kiện. Giá trị cốt lõi của dự án không nằm ở các form CRUD thông thường, mà ở hai bài toán kỹ thuật thực tế: 
1. Xử lý đăng ký đồng thời với số lượng vé giới hạn mà không bị bán vượt.
2. Xác thực vé tại cổng với độ trễ cực thấp để tránh ùn tắc.

### 2.3 Đối tượng người dùng (Actors)

| Actor | Vai trò |
| :--- | :--- |
| **Sinh viên (Attendee)** | Tìm kiếm sự kiện, đăng ký, nhận vé QR, gửi phản hồi sau sự kiện |
| **Ban tổ chức (Organizer)** | Tạo và quản lý sự kiện, check-in người tham dự, xem báo cáo thống kê & phân tích cảm xúc |
| **Hệ thống (background)** | Xử lý hàng đợi email, kiểm soát tồn kho vé qua Redis, gọi LLM API phân tích cảm xúc |

### 2.4 Giả định & ràng buộc
* Nhóm gồm 2 thành viên, không có nhân sự chuyên trách DevOps/hạ tầng.
* Thời gian thực hiện: 7 tuần, từ 04/07/2026 đến 22/08/2026.
* Thành viên có kiến thức nền tảng về React và Node.js, nhưng chưa có kinh nghiệm sâu với Redis, hàng đợi (queue) hay tích hợp LLM API — cần thời gian làm quen (proof-of-concept) ở Tuần 3.
* Ưu tiên hạ tầng miễn phí hoặc chi phí thấp: Render, Redis free-tier (ví dụ Upstash), gói miễn phí của LLM API.
* Đây là sản phẩm đồ án dùng để demo và bảo vệ, không yêu cầu vận hành thực tế 24/7.

### 2.5 Phân chia vai trò trong nhóm (2 người)

| Thành viên | Phạm vi phụ trách |
| :--- | :--- |
| **Trần Đình Nhật Quang**<br/>*(Backend & Kiến trúc)* | Thiết kế cơ sở dữ liệu, xây dựng luồng Redis chống bán vượt vé, tích hợp hàng đợi (BullMQ), API check-in tốc độ cao, xác thực JWT, cấu hình server/domain & triển khai (deploy) |
| **Hồ Tiến Dũng**<br/>*(Frontend & Tích hợp)* | Xây dựng giao diện ReactJS (trang sự kiện, form đăng ký), chức năng quét mã QR qua camera trình duyệt, dashboard biểu đồ (Recharts) hiển thị dữ liệu phân tích cảm xúc |

> **Lưu ý:** hai vai trò cần trao đổi API contract (định dạng request/response) ngay từ Tuần 2 để làm việc song song mà không bị chặn lẫn nhau.

---

## 3. Yêu cầu chức năng (Functional Requirements)

### 3.1 Quản lý tài khoản (Authentication & Account)
| ID | Mô tả chức năng | Actor | Ưu tiên |
| :--- | :--- | :--- | :--- |
| FR-01 | Đăng ký tài khoản mới bằng email, chọn vai trò Sinh viên hoặc Ban tổ chức | Sinh viên & Ban tổ chức | MVP |
| FR-02 | Đăng nhập bằng email & mật khẩu đã đăng ký | Sinh viên & Ban tổ chức | MVP |
| FR-03 | Đăng xuất khỏi phiên làm việc hiện tại | Sinh viên & Ban tổ chức | MVP |
| FR-04 | Đổi mật khẩu tài khoản khi đã đăng nhập | Sinh viên & Ban tổ chức | Could |
| FR-05 | Xem thông tin cá nhân (hồ sơ tài khoản) | Sinh viên & Ban tổ chức | Should |
| FR-06 | Cập nhật thông tin cá nhân | Sinh viên & Ban tổ chức | Should |

### 3.2 Quản lý sự kiện (Event Management)
| ID | Mô tả chức năng | Actor | Ưu tiên |
| :--- | :--- | :--- | :--- |
| FR-07 | Tạo sự kiện mới kèm landing page (ảnh bìa, mô tả, thời gian, địa điểm, số vé tối đa) | Ban tổ chức | MVP |
| FR-08 | Xem trang chi tiết sự kiện (landing page): mô tả, thời gian, địa điểm, số vé còn lại theo thời gian thực | Sinh viên | MVP |
| FR-09 | Sửa thông tin sự kiện đã tạo | Ban tổ chức | Should |
| FR-10 | Xoá / Huỷ sự kiện — chuyển trạng thái "đã huỷ" thay vì xoá cứng nếu đã phát hành vé | Ban tổ chức | Could |
| FR-11 | Xem danh sách sự kiện hiện tại đang phụ trách | Ban tổ chức | MVP |
| FR-12 | Tìm kiếm, lọc sự kiện theo CLB/phòng ban, loại hình, khoảng thời gian | Sinh viên | MVP |

### 3.3 Đăng ký & Vé điện tử (Registration & Ticket)
| ID | Mô tả chức năng | Actor | Ưu tiên |
| :--- | :--- | :--- | :--- |
| FR-13 | Đăng ký / đặt vé tham dự sự kiện | Sinh viên | MVP |
| FR-14 | Sinh mã vé QR chứa chuỗi JWT mã hoá thông tin vé | Hệ thống | MVP |
| FR-15 | Gửi vé điện tử qua email bất đồng bộ qua hàng đợi, không chặn luồng chính của server | Hệ thống | MVP |
| FR-16 | Xem danh sách vé / lịch sử đăng ký sự kiện của cá nhân | Sinh viên | Should |
| FR-17 | Xem chi tiết một vé cụ thể | Sinh viên | Should |

### 3.4 Check-in tại cổng sự kiện (Gate Check-in)
| ID | Mô tả chức năng | Actor | Ưu tiên |
| :--- | :--- | :--- | :--- |
| FR-18 | Xác thực và giải mã mã QR tại thời điểm check-in, độ trễ dưới 1 giây | Hệ thống | MVP |
| FR-19 | Ghi nhận check-in (đổi trạng thái vé, ghi CheckinLog) | Hệ thống | MVP |
| FR-20 | Xem lịch sử check-in tại cổng sự kiện | Ban tổ chức | Should |
| FR-21 | Xuất danh sách người tham dự đã check-in ra file CSV | Ban tổ chức | Could |

### 3.5 Phản hồi & Phân tích cảm xúc AI (Feedback & AI Sentiment)
| ID | Mô tả chức năng | Actor | Ưu tiên |
| :--- | :--- | :--- | :--- |
| FR-22 | Gửi đánh giá / phản hồi (feedback) sau khi đã tham dự sự kiện | Sinh viên | MVP |
| FR-23 | Xem danh sách phản hồi đã nhận được cho sự kiện | Ban tổ chức | Should |
| FR-24 | Gọi LLM API phân tích cảm xúc theo phương pháp Prompt Engineering, gộp feedback thành batch mỗi lần gọi | Hệ thống | MVP |
| FR-25 | Lưu & gắn nhãn cảm xúc (Tích cực/Tiêu cực/Trung lập) cùng từ khoá phàn nàn vào Feedback | Hệ thống | MVP |

### 3.6 Dashboard & Báo cáo thống kê (Dashboard & Statistics)
| ID | Mô tả chức năng | Actor | Ưu tiên |
| :--- | :--- | :--- | :--- |
| FR-26 | Xem dashboard thống kê số lượng / tỷ lệ người đăng ký theo thời gian thực | Ban tổ chức | Should |
| FR-27 | Xem báo cáo phân loại cảm xúc và từ khoá phàn nàn phổ biến từ feedback | Ban tổ chức | MVP |

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)

| ID | Yêu cầu | Tiêu chí đo lường / kiểm thử |
| :--- | :--- | :--- |
| NFR-01 | Hiệu năng check-in: thời gian phản hồi của API xác thực mã QR | ≤ 1 giây / request, thử với ≥ 5 lượt quét/giây tại một cổng |
| NFR-02 | Chống bán vượt vé: không phát hành vé vượt số lượng cấu hình | 0 vé vượt mức khi test ≥ 200 request đăng ký đồng thời cho sự kiện 100 vé |
| NFR-03 | Bảo mật: vé được mã hoá JWT ký bằng secret key; mật khẩu hash bcrypt; toàn bộ traffic qua HTTPS | Không thể giả mạo vé nếu không có secret key của hệ thống |
| NFR-04 | Độ tin cậy: email vé không bị thất lạc kể cả khi server khởi động lại giữa lúc xử lý hàng đợi | Job trong hàng đợi được lưu bền (persist) trên Redis, không mất khi restart |
| NFR-05 | Khả năng sử dụng: luồng đăng ký vé tối đa 3 bước thao tác, giao diện responsive trên di động | Kiểm thử trên tối thiểu Chrome desktop & Chrome mobile |
| NFR-06 | Khả năng bảo trì: codebase chia module rõ ràng, có README, biến cấu hình qua .env | Review chéo giữa 2 thành viên theo mỗi tuần |
| NFR-07 | Khả năng triển khai: hệ thống deploy được trên hạ tầng free-tier / VPS sinh viên | Deploy bản demo thành công trước Tuần 6 |
| NFR-08 | Bảo vệ dữ liệu tài khoản: mật khẩu mới khi đổi (FR-04) được hash lại bằng bcrypt trước khi lưu, không trả/log plaintext password | Kiểm tra CSDL và log server không chứa chuỗi mật khẩu thô ở bất kỳ bảng hoặc dòng log nào |

---

## 5. Kiến trúc hệ thống đề xuất

### 5.1 Kiến trúc tổng quan
Hệ thống được tổ chức theo 3 lớp:
* **Frontend:** ứng dụng React (TypeScript), hai giao diện (Sinh viên / Ban tổ chức), gọi API qua REST + JWT Bearer token. Dùng Tailwind CSS cho giao diện và Recharts cho biểu đồ dashboard.
* **Backend:** Node.js/Express (TypeScript), chịu trách nhiệm về nghiệp vụ, xác thực, sinh & giải mã JWT, điều phối hàng đợi.
* **Data layer:** một cơ sở dữ liệu quan hệ (PostgreSQL) cho dữ liệu bền vững (Event, Ticket, Feedback...) + Redis cho dữ liệu tốc độ cao (đếm vé còn lại, hàng đợi job).

### 5.2 Luồng đăng ký vé chống bán vượt (oversell)
1. Client gửi yêu cầu đăng ký vé cho một sự kiện.
2. Backend thực hiện lệnh giảm số đếm nguyên tử (atomic decrement) trên Redis cho sự kiện đó.
3. Nếu còn vé: tạo một bản ghi Registration ở trạng thái giữ chỗ tạm (TTL vài phút), đẩy job vào hàng đợi.
4. Worker xử lý hàng đợi ghi dữ liệu chính thức vào PostgreSQL, sinh vé JWT, gửi email — toàn bộ diễn ra bất đồng bộ, không chặn request gốc.
5. Nếu hết vé: Redis trả về ngay lập tức, backend phản hồi lỗi "hết vé" mà không cần chạm tới cơ sở dữ liệu chính.

### 5.3 Luồng check-in bằng mã QR (JWT)
* Vé được sinh dưới dạng mã QR chứa một chuỗi JWT đã ký, mã hoá `ticket_id`, `event_id` và thời điểm phát hành.
* Khi quét mã tại cổng, backend chỉ cần dùng secret key để giải mã và xác thực chữ ký — không cần truy vấn phức tạp vào cơ sở dữ liệu để xác minh tính hợp lệ, giúp đạt độ trễ dưới 1 giây.
* Sau khi xác thực hợp lệ, hệ thống ghi nhận check-in (đổi trạng thái vé, ghi CheckinLog) bất đồng bộ để không làm chậm phản hồi cho người quét.

### 5.4 Luồng phân tích cảm xúc phản hồi (AI)
* Sau sự kiện, toàn bộ feedback dạng văn bản được gom thành một tập dữ liệu (batch).
* Backend gọi LLM API (ví dụ Gemini hoặc OpenAI) kèm một prompt yêu cầu: phân loại từng phản hồi thành Tích cực/Tiêu cực/Trung lập, đồng thời trích xuất các từ khoá phàn nàn xuất hiện nhiều nhất, trả kết quả ở định dạng JSON.
* Kết quả được lưu vào cơ sở dữ liệu và hiển thị trực tiếp trên Dashboard bằng biểu đồ (Recharts).

### 5.5 Điều chỉnh quan trọng để đảm bảo khả thi (đã rà soát so với mô tả gốc)
* Không huấn luyện/tinh chỉnh mô hình BERT riêng — dùng LLM API có sẵn kết hợp Prompt Engineering. Việc này giữ nguyên giá trị demo (dashboard vẫn chạy mượt, dữ liệu vẫn "thật") nhưng giảm khối lượng công việc từ vài tuần xuống còn khoảng 1 buổi code tích hợp.
* Thay RabbitMQ/Kafka bằng BullMQ (xây trên nền Redis) cho hàng đợi xử lý email/vé. Vì Redis đã được dùng để kiểm soát tồn kho vé, việc tái sử dụng Redis cho cả hàng đợi giúp nhóm không phải học và vận hành thêm một hệ thống hạ tầng riêng biệt, trong khi vẫn giữ đúng bản chất kiến trúc "xử lý bất đồng bộ qua hàng đợi" để trình bày khi bảo vệ.
* Dùng một cơ sở dữ liệu quan hệ duy nhất (PostgreSQL) thay vì tách nhiều loại CSDL khác nhau, nhằm giảm độ phức tạp vận hành trong thời gian 7 tuần.

---

## 6. Yêu cầu dữ liệu

### 6.1 Các thực thể chính
| Thực thể | Trường chính (rút gọn) | Mô tả |
| :--- | :--- | :--- |
| **User** | id, name, email, password_hash, role, created_at | Tài khoản dùng chung cho sinh viên và ban tổ chức, phân biệt bằng role |
| **Event** | id, title, description, cover_image, location, start_time, end_time, organizer_id, max_tickets, status | Thông tin sự kiện, hiển thị trên landing page |
| **Registration** | id, event_id, user_id, status, requested_at | Yêu cầu giữ vé tạm thời, được xử lý bất đồng bộ qua hàng đợi |
| **Ticket** | id, registration_id, jwt_code, status, issued_at | Vé chính thức đã phát hành, chứa mã QR/JWT |
| **Feedback** | id, event_id, user_id, content, sentiment_label, created_at | Phản hồi của sinh viên sau sự kiện, có gắn nhãn cảm xúc từ AI |
| **CheckinLog** | id, ticket_id, checkin_time, staff_id | Lịch sử quét vé tại cổng sự kiện |

### 6.2 Quan hệ giữa các thực thể (tóm tắt)
* Một User (role = organizer) tạo ra nhiều Event.
* Một Event có nhiều Registration (yêu cầu giữ vé) và nhiều Feedback.
* Mỗi Registration hợp lệ sinh ra đúng một Ticket sau khi được hàng đợi xử lý.
* Mỗi Ticket có tối đa một CheckinLog tương ứng khi được quét tại cổng sự kiện.

> **Khuyến nghị:** vẽ ERD chi tiết (kèm kiểu dữ liệu, khoá chính/khoá ngoại) trong tài liệu thiết kế kỹ thuật riêng ở Tuần 1, dựa trên bảng thực thể tóm tắt ở trên.

---

## 7. Yêu cầu giao diện ngoài (External Interfaces)

### 7.1 Giao diện người dùng
Ứng dụng web ReactJS, thiết kế responsive, tối ưu cho cả desktop (ban tổ chức thao tác) và mobile (sinh viên đăng ký, ban tổ chức quét QR bằng điện thoại).

### 7.2 Giao diện API
REST API, dữ liệu trao đổi dạng JSON, xác thực bằng JWT Bearer token trong header Authorization.

### 7.3 Giao diện phần cứng
Không cần thiết bị quét chuyên dụng — dùng camera điện thoại/laptop qua trình duyệt (WebRTC getUserMedia) để quét mã QR.

### 7.4 Dịch vụ/phần mềm bên thứ ba
| Dịch vụ | Vai trò |
| :--- | :--- |
| **Email service** | Gửi vé điện tử và thông báo cho sinh viên (Resend/SendGrid free-tier) |
| **LLM API** | Phân tích cảm xúc & trích xuất từ khoá phàn nàn từ feedback (Gemini/OpenAI) |
| **Redis** | Đếm số vé còn lại theo thời gian thực + nền tảng cho hàng đợi BullMQ |
| **Hosting (Render)** | Triển khai backend, frontend và cơ sở dữ liệu cho bản demo |

---

## 8. Ma trận Use Case tóm tắt

| Actor | Use case chính |
| :--- | :--- |
| **Sinh viên** | Tìm & xem sự kiện · Đăng ký vé · Nhận vé QR · Xem lịch sử vé · Gửi feedback · Huỷ đăng ký |
| **Ban tổ chức** | Tạo sự kiện · Cấu hình số vé · Check-in bằng quét QR · Xem dashboard người đăng ký · Xem báo cáo cảm xúc AI · Xuất CSV |
| **Hệ thống (actor phụ)** | Sinh & xác thực JWT/QR · Điều phối hàng đợi email · Gọi LLM API phân tích cảm xúc · Giới hạn tốc độ (rate limit) qua Redis |

---

## 9. Kế hoạch triển khai 7 tuần

Lịch trình dưới đây ưu tiên hoàn thành toàn bộ hạng mục MVP trước Tuần 6, để lại Tuần 7 làm vùng đệm cho việc chuẩn bị bảo vệ thay vì code tính năng mới.

| Tuần | Thời gian | Nội dung chính | Note |
| :--- | :--- | :--- | :--- |
| **Tuần 1** | 04/07 - 11/07 | Tìm hiểu, nghiên cứu và đề xuất đề tài; khảo sát ứng dụng tương tự; lựa chọn công nghệ; phân tích và thiết kế hệ thống. | |
| **Tuần 2** | 12/07 - 18/07 | Làm sơ đồ CSDL; đăng ký/đăng nhập/đăng xuất, quên & đổi mật khẩu. Hoàn thiện quản lý tài khoản cá nhân; xây dựng chức năng quản lý sự kiện; tìm kiếm & lọc sự kiện cho sinh viên. | |
| **Tuần 3** | 19/07 - 25/07 | Làm PoC Redis giữ vé + hàng đợi; Xây dựng luồng đăng ký/đặt vé chống bán vượt (Redis + BullMQ); sinh mã vé QR/JWT; gửi vé điện tử qua email; xem danh sách vé. | |
| **Tuần 4** | 26/07 - 01/08 | Xây dựng API xác thực & check-in bằng QR; ghi nhận lịch sử check-in; xuất danh sách người tham dự ra CSV. | |
| **Tuần 5** | 02/08 - 08/08 | Xây dựng chức năng gửi phản hồi sau sự kiện; tích hợp LLM API phân tích cảm xúc; dựng dashboard thống kê đăng ký và báo cáo cảm xúc. | |
| **Tuần 6** | 09/08 - 15/08 | Hoàn thiện các cơ chế nền (giới hạn tốc độ, tự động hết hạn giữ chỗ, đồng bộ trên Redis); kiểm thử tổng thể, load test đăng ký đồng thời, sửa lỗi, deploy bản demo. | |
| **Tuần 7** | 16/08 - 22/08 | Hoàn thiện sản phẩm demo; viết báo cáo tổng kết. | |

---

## 10. Rủi ro & Giải pháp giảm thiểu

| STT | Rủi ro | Mức độ | Giải pháp giảm thiểu |
| :--- | :--- | :--- | :--- |
| 1 | Redis + hàng đợi (BullMQ) là công nghệ mới với cả nhóm | Cao | Làm PoC nhỏ (một luồng giữ vé hoàn chỉnh) ngay trong Tuần 1, trước khi build tính năng đầy đủ |
| 2 | Giới hạn / chi phí gọi LLM API (Gemini, OpenAI) | Trung bình | Dùng gói miễn phí, gộp feedback thành 1 batch mỗi lần gọi thay vì gọi lẻ từng phản hồi, cache kết quả |
| 3 | Lịch trình 7 tuần cho 2 người khá gấp nếu ôm hết mọi hạng mục Should/Could | Cao | Hoàn thành 100% các hạng mục MVP trước; chỉ làm thêm Should/Could nếu còn dư thời gian ở Tuần 6-7 |
| 4 | Một thành viên gặp sự cố đột xuất (ốm, bận việc cá nhân...) | Trung bình | Tài liệu hoá kiến trúc & luồng xử lý ngay từ SRS này để người còn lại có thể tiếp quản nhanh |
| 5 | Triển khai (deploy) gặp sự cố sát ngày bảo vệ | Trung bình | Deploy bản demo sớm nhất có thể (trước Tuần 6), không dồn việc triển khai vào tuần cuối |

---

## 11. Tiêu chí nghiệm thu cho bản demo (Definition of Done)
* Mô phỏng ≥ 200 lượt đăng ký đồng thời cho một sự kiện chỉ có 100 vé — hệ thống không phát hành vượt quá 100 vé.
* API xác thực check-in phản hồi trong ≤ 1 giây khi quét mã QR liên tục.
* Dashboard hiển thị đúng số liệu phân loại cảm xúc từ tối thiểu 50 feedback mẫu, kèm danh sách từ khoá phàn nàn phổ biến.
* Toàn bộ luồng end-to-end chạy được trực tiếp trong buổi bảo vệ: tạo sự kiện → đăng ký → nhận vé QR qua email → quét QR check-in trực tiếp trên điện thoại của hội đồng.
* Hệ thống đã được deploy và truy cập được qua một đường link công khai, không phụ thuộc vào máy tính cá nhân của nhóm.

---
*— Hết tài liệu SRS phiên bản 1.1 —*
