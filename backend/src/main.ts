import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

function isStrictPort(): boolean {
  if (process.env.STRICT_PORT === 'true') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
}

function logStartup(port: number) {
  const mode = isStrictPort()
    ? 'Docker/Production — cố định PORT từ env'
    : 'Development — tự đổi port nếu bận';

  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log('  Google Photos Backend');
  console.log(`  Chế độ   : ${mode}`);
  console.log(`  PORT env : ${process.env.PORT ?? '(mặc định 5000)'}`);
  console.log(`  Đang chạy: http://0.0.0.0:${port}`);
  console.log(`  Truy cập : http://localhost:${port}`);
  console.log('══════════════════════════════════════════════════');
  console.log('');
}

async function bootstrap() {
  const port = parseInt(process.env.PORT || '5000', 10);
  const strict = isStrictPort();

  const startServer = async (currentPort: number): Promise<void> => {
    try {
      const app = await NestFactory.create(AppModule);
      app.enableCors();
      await app.listen(currentPort, '0.0.0.0');

      const dataSource = app.get(DataSource);
      if (dataSource.isInitialized) {
        console.log('✅ [Database] Kết nối thành công tới CSDL SQLite (sql.js)');
      }

      logStartup(currentPort);
    } catch (error: any) {
      if (!strict && error.code === 'EADDRINUSE') {
        console.warn(
          `⚠️ [Port] Port ${currentPort} đang bận. Đang thử port ${currentPort + 1}...`,
        );
        await startServer(currentPort + 1);
        return;
      }

      if (error.code === 'EADDRINUSE') {
        console.error('');
        console.error(`❌ [Port] Port ${currentPort} đã được sử dụng.`);
        console.error(
          '   Hãy đổi PORT trong backend/.env và cập nhật ports trong docker-compose.yml.',
        );
        console.error('');
      } else {
        console.error('❌ [Server] Lỗi khi khởi động:', error);
      }
      process.exit(1);
    }
  };

  await startServer(port);
}
bootstrap();

