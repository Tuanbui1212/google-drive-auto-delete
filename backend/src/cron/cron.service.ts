import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { google } from 'googleapis';
import { MediaItem } from '../upload/entities/media-item.entity';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectRepository(MediaItem)
    private mediaItemRepo: Repository<MediaItem>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    this.logger.debug('Checking for expired files to delete...');

    const now = new Date();
    // Lấy các file có thời gian deleteAt <= hiện tại
    const expiredItems = await this.mediaItemRepo.find({
      where: { deleteAt: LessThanOrEqual(now) },
    });

    if (expiredItems.length === 0) {
      return;
    }

    this.logger.log(`Found ${expiredItems.length} files to delete.`);

    for (const item of expiredItems) {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: item.accessToken });
        const drive = google.drive({ version: 'v3', auth });

        // Gọi Google Drive API để xóa file
        await drive.files.delete({ fileId: item.fileId });
        this.logger.log(`Deleted file ${item.fileId} from Google Drive.`);

        // Xóa khỏi DB sau khi xóa thành công
        await this.mediaItemRepo.remove(item);
      } catch (error: any) {
        this.logger.error(`Failed to delete file ${item.fileId}: ${error.message}`);
        // Có thể cần kiểm tra nếu lỗi là 404 (file đã bị xóa tay), ta cũng remove khỏi DB
        if (error.code === 404 || error.status === 404) {
           await this.mediaItemRepo.remove(item);
        }
      }
    }
  }
}
