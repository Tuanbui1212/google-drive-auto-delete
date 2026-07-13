# Chrome Extension — Xóa ảnh Google Photos

Extension xóa ảnh **trực tiếp trên Google Photos** bằng session Chrome profile đang đăng nhập.

## Tính năng

- **Tự động xóa sau 5 phút** (có thể đổi) — dùng `chrome.alarms`, kiểm tra mỗi phút
- **Xóa ảnh đã quá hạn** — chỉ xóa ảnh upload đủ thời gian
- **Xóa ngay (tất cả)** — xóa toàn bộ ảnh đã upload
- **Đồng bộ backend** — sau khi xóa trên Google Photos, gọi `DELETE /upload/:id` để xóa bản ghi local

## Cài đặt

1. Chrome → `chrome://extensions`
2. Bật **Developer mode**
3. **Load unpacked** → chọn thư mục `extension/`
4. Bấm **Reload** sau mỗi lần cập nhật code

## Bật tự động xóa 5 phút

1. Đăng nhập [Google Photos](https://photos.google.com) trong Chrome profile
2. Bấm icon extension
3. Nhập Backend API (`http://localhost:5000`) + email upload
4. Tick **Tự động xóa sau 5 phút**
5. Bấm **Lưu cài đặt tự động**

Extension sẽ **mỗi phút** kiểm tra backend, xóa ảnh đã upload **quá 5 phút**.

## Xóa thủ công

- **Xóa ảnh đã quá hạn** — chỉ xóa ảnh đủ điều kiện thời gian
- **Xóa ngay (tất cả)** — xóa toàn bộ ảnh trong danh sách backend

## Lưu ý

- Chrome phải đang chạy (extension chạy nền qua `chrome.alarms`)
- Phải đăng nhập đúng tài khoản Google Photos trong **cùng Chrome profile**
- Backend chỉ cung cấp danh sách ảnh — **không có API xóa Google Photos**
- Extension tự mở từng ảnh trên `photos.google.com` và bấm **Chuyển vào thùng rác**
- Sau khi xóa thành công, extension gọi backend để xóa metadata + thumbnail local
