import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  let port = parseInt(process.env.PORT || '5000', 10);
  
  const startServer = async (currentPort: number) => {
    try {
      const app = await NestFactory.create(AppModule);
      app.enableCors();
      await app.listen(currentPort);

      // Kiểm tra kết nối DB
      const dataSource = app.get(DataSource);
      if (dataSource.isInitialized) {
        console.log('\x1b[32m%s\x1b[0m', '✅ [Database] Kết nối thành công tới CSDL SQLite (sql.js)!');
      }

      console.log('\x1b[36m%s\x1b[0m', `🚀 [Server] Backend is running on: http://localhost:${currentPort}`);
    } catch (error: any) {
      if (error.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${currentPort} is busy. Trying ${currentPort + 1}...`);
        await startServer(currentPort + 1);
      } else {
        console.error('Error starting server:', error);
        process.exit(1);
      }
    }
  };

  await startServer(port);
}
bootstrap();
