import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MediaItem } from './entities/media-item.entity';
import { UploadGateway } from './upload.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([MediaItem]), AuthModule],
  controllers: [UploadController],
  providers: [UploadService, UploadGateway],
  exports: [TypeOrmModule],
})
export class UploadModule {}
