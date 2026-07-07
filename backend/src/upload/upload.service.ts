import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { MediaItem } from './entities/media-item.entity';
import { UserSetting } from './entities/user-setting.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UploadService {
  constructor(
    @InjectRepository(MediaItem)
    private mediaItemRepo: Repository<MediaItem>,
    @InjectRepository(UserSetting)
    private userSettingRepo: Repository<UserSetting>,
    private configService: ConfigService,
  ) {}

  async getUserSetting(email: string) {
    const setting = await this.userSettingRepo.findOne({ where: { email } });
    if (!setting) {
      // Mặc định là 5 phút nếu chưa cài
      return { email, delayMinutes: 5 };
    }
    return setting;
  }

  async updateUserSetting(email: string, delayMinutes: number) {
    let setting = await this.userSettingRepo.findOne({ where: { email } });
    if (!setting) {
      setting = this.userSettingRepo.create({ email, delayMinutes });
    } else {
      setting.delayMinutes = delayMinutes;
    }
    await this.userSettingRepo.save(setting);
    return setting;
  }

  async uploadFile(file: Express.Multer.File, accessToken: string, email: string) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: 'v3', auth });

      const fileMetadata = {
        name: file.originalname,
      };

      const media = {
        mimeType: file.mimetype,
        body: Readable.from(file.buffer),
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, thumbnailLink',
      });

      const fileId = response.data.id;
      // Nếu Google chưa kịp tạo thumbnailLink, dùng fallback URL
      const thumbnailLink = response.data.thumbnailLink || `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
      if (!fileId) throw new Error('Upload failed, no ID returned');

      // Lấy cấu hình của user
      const userSetting = await this.getUserSetting(email);
      const delayMinutes = userSetting.delayMinutes;
      const deleteAt = new Date();
      deleteAt.setMinutes(deleteAt.getMinutes() + Number(delayMinutes));

      const item = this.mediaItemRepo.create({
        fileId,
        accessToken,
        deleteAt,
        email,
        fileName: file.originalname,
        thumbnailLink,
      });
      await this.mediaItemRepo.save(item);

      return { success: true, fileId, thumbnailLink, deleteAt, fileName: file.originalname };
    } catch (error: any) {
      console.error('Lỗi chi tiết khi upload:', error);
      const errorMsg = error.response?.data?.error?.message || error.message || 'Lỗi không xác định';
      throw new InternalServerErrorException(`Lỗi Upload: ${errorMsg}`);
    }
  }

  async getMyFiles(email: string) {
    return this.mediaItemRepo.find({
      where: { email },
      order: { deleteAt: 'ASC' }
    });
  }

  async deleteFile(id: number, email: string) {
    const item = await this.mediaItemRepo.findOne({ where: { id, email } });
    if (!item) throw new InternalServerErrorException('Không tìm thấy file hợp lệ để xóa');

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: item.accessToken });
      const drive = google.drive({ version: 'v3', auth });
      
      // Xóa trên Google Drive
      await drive.files.delete({ fileId: item.fileId });
      
      // Xóa trong SQLite
      await this.mediaItemRepo.remove(item);
      return { success: true, message: 'Đã xóa file thành công' };
    } catch (error: any) {
      console.error('Lỗi khi xóa file thủ công:', error);
      
      // Nếu file đã bị xóa trên Drive (lỗi 404), thì cũng xóa luôn trong DB để đồng bộ
      if (error.response?.status === 404) {
        await this.mediaItemRepo.remove(item);
        return { success: true, message: 'File đã bị xóa trên Drive, đã đồng bộ lại DB' };
      }
      
      throw new InternalServerErrorException('Không thể xóa file trên Google Drive');
    }
  }
}
