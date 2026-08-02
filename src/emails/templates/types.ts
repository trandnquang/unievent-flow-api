// Kết quả dựng của một template email: đủ ba phần để đưa thẳng vào transporter.sendMail().
// Phần `text` KHÔNG phải tuỳ chọn — client không đọc được HTML (và bộ lọc thư rác) đều dựa
// vào nó, thiếu thì email dễ bị đánh dấu spam.
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}
