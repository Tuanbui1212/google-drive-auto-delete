import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MediaItem } from './entities/media-item.entity';
import { UserSetting } from './entities/user-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MediaItem, UserSetting])],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [TypeOrmModule]
})
export class UploadModule {}
