import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { CronModule } from './cron/cron.module';
import { MediaItem } from './upload/entities/media-item.entity';
import { UserSetting } from './upload/entities/user-setting.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'sqljs',
      location: 'database.sqlite',
      autoSave: true,
      entities: [MediaItem, UserSetting],
      synchronize: true, // Tự động tạo bảng dựa trên entity (chỉ dùng cho dev)
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UploadModule,
    CronModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
