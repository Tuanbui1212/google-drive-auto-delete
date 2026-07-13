# Google Photos Upload Tool

Ứng dụng full-stack (Next.js + NestJS) cho phép người dùng đăng nhập Google và upload ảnh lên **Google Photos**.

## Yêu cầu

- [Docker](https://www.docker.com/get-started) và Docker Compose
- Tài khoản Google Cloud Console để cấu hình OAuth 2.0

## Cấu hình Google Auth

1. Vào [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo project mới (hoặc dùng project hiện có).
3. Bật **Google Photos Library API** cho project.
4. Cấu hình **OAuth Consent Screen**:
   - Chọn "Testing" hoặc "In production".
   - Nếu dùng "Testing", thêm email test user.
5. Tạo **Credentials** → **OAuth client ID** (Web application):
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:5000/auth/google/callback`
6. Lưu lại `Client ID` và `Client Secret`.

**OAuth scope cần thiết:**
- `https://www.googleapis.com/auth/photoslibrary.appendonly` (upload)
- `https://www.googleapis.com/auth/photoslibrary.readonly` (xem ảnh / refresh thumbnail)

## Chạy ứng dụng (Docker)

1. **Clone repository:**
   ```bash
   git clone <your-repo-url>
   cd tool-google-photo
   ```

2. **Cấu hình biến môi trường:**
   - Trong thư mục `backend`, copy `.env.example` thành `.env`:
     ```env
     PORT=5000
     FRONTEND_URL=http://localhost:3000
     GOOGLE_CLIENT_ID=your_google_client_id
     GOOGLE_CLIENT_SECRET=your_google_client_secret
     GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
     ```
   - Trong thư mục `frontend`, copy `.env.example` thành `.env`:
     ```env
     NEXT_PUBLIC_API_URL=http://localhost:5000
     ```

3. **Chạy Docker Compose:**
   ```bash
   docker-compose up --build -d
   ```

4. **Truy cập:** `http://localhost:3000`

5. **Xem log port backend đang chạy:**
   ```bash
   docker-compose logs backend
   ```
   Khi khởi động thành công sẽ in ra:
   ```
   ══════════════════════════════════════════════════
     Google Photos Backend
     Chế độ   : Docker/Production — cố định PORT từ env
     PORT env : 5000
     Đang chạy: http://0.0.0.0:5000
     Truy cập : http://localhost:5000
   ══════════════════════════════════════════════════
   ```

### Đổi port backend (khi port bận)

Trong Docker, backend **không tự đổi port** — dùng đúng `PORT` từ env. Để đổi port:

1. Tạo file `.env` ở thư mục gốc project (cùng cấp `docker-compose.yml`):
   ```env
   BACKEND_PORT=5001
   ```
2. Cập nhật `backend/.env`: `PORT=5001`, `GOOGLE_CALLBACK_URL=http://localhost:5001/auth/google/callback`
3. Cập nhật `frontend/.env`: `NEXT_PUBLIC_API_URL=http://localhost:5001`
4. Chạy lại: `docker-compose up --build -d`

Khi chạy local (`npm run start:dev`), nếu port bận backend sẽ **tự thử port kế tiếp** và in cảnh báo ra terminal.

## API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/auth/google` | Bắt đầu đăng nhập Google |
| `GET` | `/auth/google/callback` | Callback OAuth → redirect về frontend |
| `POST` | `/upload` | Upload ảnh lên Google Photos |
| `GET` | `/upload/my-files?email=...&accessToken=...` | Danh sách ảnh đã upload |
| `DELETE` | `/upload/:id?email=...` | Xóa bản ghi local (extension gọi sau khi xóa trên Google Photos) |

### Upload response

```json
{
  "success": true,
  "mediaItemId": "...",
  "thumbnailUrl": "https://...",
  "productUrl": "https://photos.google.com/...",
  "fileName": "photo.jpg",
  "createdAt": "2026-07-09T..."
}
```

### Xem ảnh (thumbnail)

Dự án sử dụng trực tiếp URL ảnh (`baseUrl`) từ Google Photos. Vì URL này có thời hạn ~60 phút nên khi gọi `GET /upload/my-files`, bạn cần truyền thêm `accessToken` để backend tự động lấy URL mới nhất từ Google Photos API.

## Xóa ảnh — Chrome Extension (không có API xóa)

Backend **không có** API xóa. Chức năng xóa nằm trong **Chrome Extension** tại thư mục `extension/`.

### Cài extension

1. Chrome → `chrome://extensions` → bật **Developer mode**
2. **Load unpacked** → chọn thư mục `extension/`

### Bật tự động xóa 5 phút

1. Load extension → nhập API + email
2. Tick **Tự động xóa sau 5 phút** → **Lưu cài đặt tự động**
3. Extension kiểm tra mỗi phút, tự xóa ảnh đã upload quá 5 phút (Chrome phải đang mở)

### Xóa thủ công

Bấm **Xóa ngay (tất cả)** trong popup extension.

Extension lấy danh sách từ `GET /upload/my-files`, mở từng ảnh trên Google Photos và tự bấm **Chuyển vào thùng rác**.

Chi tiết: xem [extension/README.md](extension/README.md)

## Lưu trữ dữ liệu

Backend dùng SQLite lưu metadata ảnh đã upload (`mediaItemId`, `baseUrl`, `productUrl`, ...). Database được persist qua Docker volume `backend-data`.

## Dừng ứng dụng

```bash
docker-compose down
```

## Tech Stack

- **Frontend:** Next.js (React), Tailwind CSS
- **Backend:** NestJS, TypeScript, TypeORM, SQLite
- **Chrome Extension:** Xóa ảnh qua Google Photos UI
- **Google API:** Google Photos Library API (upload + xem)
- **Deployment:** Docker & Docker Compose
