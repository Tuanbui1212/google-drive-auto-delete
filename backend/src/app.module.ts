import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { MediaItem } from './upload/entities/media-item.entity';
import { UserSession } from './auth/entities/user-session.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'sqljs',
      location: 'data/database.sqlite',
      autoSave: true,
      entities: [MediaItem, UserSession],
      synchronize: true,
    }),
    AuthModule,
    UploadModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
