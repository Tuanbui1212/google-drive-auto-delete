import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('media_items')
export class MediaItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string; // Phân biệt người dùng

  @Column()
  fileName: string; // Tên gốc của ảnh

  @Column()
  fileId: string; // ID của file trên Google Drive

  @Column({ nullable: true })
  thumbnailLink: string; // Đường dẫn ảnh thu nhỏ từ Google Drive

  @Column()
  accessToken: string; // Token để có quyền xóa file này

  @Column()
  deleteAt: Date; // Thời điểm cần xóa (thường là hiện tại + 5 phút)
}
