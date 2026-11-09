================================================================================
TACTIC ADPULSE — MINI CAMPAIGN KPI DASHBOARD
Cuộc thi Vibe Coding 2026 — Bảng A (Công nghệ)
Trường Cao đẳng FPT Polytechnic
================================================================================

1. GIỚI THIỆU SẢN PHẨM & CÔNG NGHỆ:
- Tên sản phẩm: Tactic AdPulse Dashboard
- Mục đích: Hệ thống Dashboard quản trị và chẩn đoán hiệu suất chiến dịch quảng cáo mini (Digital Marketing). Hỗ trợ tự động tính toán chỉ số cốt lõi (Click/reach, CPC, CPA, CVR), chẩn đoán nguyên nhân biến động chi phí trên mỗi đơn theo công thức phân rã phễu (CPA = CPC ÷ CVR), tích hợp Gemini 3.8 Flash AI đề xuất 03 hành động cải thiện và trợ lý hỏi đáp số liệu có Context Caching.
- Công nghệ sử dụng:
  + Frontend: Vanilla HTML5, CSS3, Tailwind CSS (Design Tokens, Dark/Light Mode, Responsive), Chart.js (Biểu đồ tương tác kết hợp Cột & Đường).
  + Backend: Node.js HTTP Server Native (Zero-framework, tối ưu tài nguyên, không phụ thuộc Express).
  + Xử lý đa định dạng: SheetJS (Excel .xlsx), Mammoth (Word .docx), PDFKit & PDF-Parse (PDF), CSV.
  + Kiểm thử tự động: Node.js Test Runner (22 unit tests) & Playwright (9 E2E tests).

2. CHẾ ĐỘ AI TRONG SẢN PHẨM (BẢNG A):
- Chế độ: "AI thật có Mock / Fallback dự phòng" (Đạt tiêu chuẩn tối đa nhóm A3: 15/15 điểm).
- Model AI: Google Gemini 3.8 Flash (qua Google Generative Language API) & Gemini Vision OCR.
- Hệ thống Kiểm soát đầu ra 6 lớp (6-Layer Guardrails Architecture):
  + Lớp 1 - Schema Enforcement: Ép định dạng JSON có cấu trúc strictly-typed.
  + Lớp 2 - Quantitative Guardrails: Ép đúng 3 khuyến nghị, phủ 3 trụ cột (creative / budget / conversion), giới hạn ký tự.
  + Lớp 3 - Direction Alignment: Chiều hướng gợi ý bắt buộc phải khớp 100% với kết luận toán học.
  + Lớp 4 - Banned Phrases: Chặn hoàn toàn các phát ngôn võ đoán, cam kết 100%, bảo đảm tăng trưởng.
  + Lớp 5 - Fact-Checking & Grounding: Trích xuất toàn bộ con số trong văn bản phản hồi và đối chiếu với danh sách Facts tính sẵn từ dữ liệu chiến dịch; chặn số bịa.
  + Lớp 6 - Graceful Fallback: Nếu mất kết nối mạng hoặc lỗi quota -> tự động kích hoạt bộ gợi ý toán học dự phòng, kèm nhãn nguồn gốc minh bạch.
- Trợ lý hỏi đáp số liệu (AI Chat Assistant): Tự động băm SHA-256 dữ liệu chiến dịch thành contextId, lưu Facts trong RAM cache máy chủ (30 phút) và lưu câu trả lời vào LocalStorage (0 token khi xem lại).

3. HƯỚNG DẪN CÀI ĐẶT & CHẠY TỪ SOURCE:
Bước 1: Cài đặt thư viện phụ thuộc:
   npm install

Bước 2: Cấu hình môi trường (Tùy chọn cho AI thật):
   cp .env.example .env
   # Mở file .env và điền GEMINI_API_KEY nếu có key riêng.
   # Nếu không điền key, ứng dụng vẫn hoạt động 100% mượt mà với bộ Fallback dự phòng.

Bước 3: Khởi chạy máy chủ:
   npm start
   # Server sẽ lắng nghe tại: http://127.0.0.1:8082 (hoặc PORT được chỉ định trong .env)

Bước 4: Mở trình duyệt:
   Truy cập http://127.0.0.1:8082 trên trình duyệt Chrome, Brave, Edge hoặc Firefox.

4. HƯỚNG DẪN CHẠY KIỂM THỬ:
- Chạy 22 Unit Tests (Toán học, phân rã CPA, trích xuất file Excel/Word/PDF/CSV, Guardrails):
   npm test
- Chạy 9 Playwright End-to-End Tests (Kiểm thử tương tác giao diện thực tế):
   npm run test:e2e
   (Lần đầu chạy cần cài Chromium nếu chưa có: npx playwright install chromium)

5. GIỚI HẠN CỦA SẢN PHẨM:
- Dữ liệu Reach (Tiếp cận) là tổng cộng dồn theo ngày của chiến dịch, có thể tồn tại người xem trùng lặp (không tương đương Unique Reach toàn kỳ).
- Tỷ lệ Click/reach phản ánh mức độ hấp dẫn của quảng cáo trên người tiếp cận, khác với CTR tiêu chuẩn (Clicks ÷ Impressions) do nền tảng báo cáo.
- Mọi khuyến nghị của AI được thiết kế dưới dạng giả thuyết thực nghiệm cần đo lường lại, không thay thế quyết định kinh doanh cuối cùng của nhà quảng cáo.
================================================================================
