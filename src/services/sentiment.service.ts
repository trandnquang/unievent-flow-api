import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

// Phân tích cảm xúc phản hồi bằng Google Gemini (FR-25/26, BR-72/74).
// Chỉ tiến trình worker gọi file này — API không bao giờ chờ LLM (SRS mục 5.6).

export interface SentimentInput {
  id: string;
  content: string;
}

export interface SentimentOutput {
  id: string;
  sentiment_label: 'positive' | 'negative' | 'neutral';
  keywords: string[];
}

// Chia lô để một sự kiện có hàng trăm phản hồi vẫn không vượt giới hạn token trong 1 lần gọi
const BATCH_SIZE = 50;

// Giới hạn số từ khoá mỗi phản hồi: cột feedbacks.keywords là TEXT, và bảng "từ khoá nổi
// bật" trên dashboard chỉ hiển thị vài mục đầu nên lấy nhiều hơn cũng không dùng tới.
const MAX_KEYWORDS_PER_FEEDBACK = 5;

const SYSTEM_PROMPT = [
  'Bạn là bộ phân tích phản hồi sự kiện của sinh viên Việt Nam.',
  'Với MỖI phản hồi được đánh số, hãy trả về:',
  '- sentiment_label: "positive" nếu người viết hài lòng, "negative" nếu không hài lòng,',
  '  "neutral" nếu trung tính hoặc không rõ thái độ.',
  `- keywords: tối đa ${MAX_KEYWORDS_PER_FEEDBACK} từ/cụm từ khoá NGẮN (1-3 từ) bằng tiếng Việt,`,
  '  viết thường, mô tả chủ đề được nhắc tới (ví dụ: "âm thanh", "nội dung hữu ích", "chờ lâu").',
  'Chỉ trả về JSON đúng cấu trúc, không giải thích thêm.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      sentiment_label: {
        type: Type.STRING,
        enum: ['positive', 'negative', 'neutral'],
      },
      keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['id', 'sentiment_label', 'keywords'],
  },
};

let client: GoogleGenAI | null = null;

const getClient = (): GoogleGenAI => {
  if (!env.GEMINI_API_KEY) {
    // Báo lỗi rõ ràng thay vì để SDK ném lỗi khó hiểu. env.ts đã cảnh báo lúc khởi động.
    throw new AppError(
      503,
      'SENTIMENT_UNAVAILABLE',
      'Chức năng phân tích cảm xúc chưa được cấu hình (thiếu GEMINI_API_KEY).'
    );
  }

  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
};

const analyzeBatch = async (
  items: SentimentInput[]
): Promise<SentimentOutput[]> => {
  const response = await getClient().models.generateContent({
    model: env.GEMINI_MODEL,
    contents: items
      .map((item) => `[${item.id}]\n${item.content}`)
      .join('\n\n---\n\n'),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      // Ép mô hình trả JSON đúng cấu trúc thay vì tự parse văn bản tự do
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error('Gemini trả về phản hồi rỗng');
  }

  const parsed = JSON.parse(raw) as SentimentOutput[];

  // Mô hình có thể trả thừa/thiếu/sai id — chỉ giữ lại mục khớp đúng lô đã gửi
  const requestedIds = new Set(items.map((item) => item.id));
  return parsed
    .filter((item) => requestedIds.has(item.id))
    .map((item) => ({
      id: item.id,
      sentiment_label: item.sentiment_label,
      keywords: (item.keywords ?? [])
        .slice(0, MAX_KEYWORDS_PER_FEEDBACK)
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 0),
    }));
};

export class SentimentService {
  // Phân tích cả danh sách, tự chia lô. Lô nào lỗi thì bỏ qua lô đó và tiếp tục — một lô
  // hỏng không được kéo đổ toàn bộ batch, vì các phản hồi chưa phân tích vẫn còn
  // analyzed_at IS NULL nên lần chạy sau sẽ tự lấy lại (partial index idx_feedbacks_unanalyzed).
  public static async analyze(
    items: SentimentInput[]
  ): Promise<SentimentOutput[]> {
    const results: SentimentOutput[] = [];

    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = items.slice(start, start + BATCH_SIZE);
      try {
        results.push(...(await analyzeBatch(batch)));
      } catch (error) {
        console.error(
          `❌ [ERROR] Phân tích cảm xúc thất bại cho lô ${start / BATCH_SIZE + 1} (${batch.length} phản hồi):`,
          error instanceof Error ? error.message : error
        );
      }
    }

    return results;
  }

  // BR-74: cột feedbacks.keywords là TEXT, không phải mảng — quy ước lưu là chuỗi phân
  // tách bằng dấu phẩy, chữ thường, đã trim.
  public static serializeKeywords(keywords: string[]): string {
    return keywords.join(',');
  }

  public static parseKeywords(raw: string | null): string[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
  }
}
