import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronService } from './cron.service';
import { MediaItem } from '../upload/entities/media-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MediaItem])],
  providers: [CronService]
})
export class CronModule {}
