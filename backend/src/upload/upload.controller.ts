import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  Get,
  Delete,
  Query,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadGateway } from './upload.gateway';
import { AuthService } from '../auth/auth.service';

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly uploadGateway: UploadGateway,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!sessionId) {
      throw new BadRequestException('Missing session');
    }

    const session = await this.authService.resolveSession(sessionId);
    const result = await this.uploadService.uploadFile(
      file,
      session.accessToken,
      session.email,
    );
    this.uploadGateway.emitFilesUpdated(session.email);
    return result;
  }

  @Get('my-files')
  async getMyFiles(
    @Query('email') email?: string,
    @Query('sessionId') sessionId?: string,
    @Query('accessToken') accessToken?: string,
  ) {
    if (sessionId) {
      const session = await this.authService.resolveSession(sessionId);
      return this.uploadService.getMyFiles(session.email, session.accessToken);
    }

    if (!email) {
      throw new BadRequestException('Email is required');
    }
    return this.uploadService.getMyFiles(email, accessToken);
  }

  @Delete(':id')
  async deleteLocalRecord(
    @Param('id', ParseIntPipe) id: number,
    @Query('email') email: string,
  ) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    const result = await this.uploadService.deleteLocalRecord(id, email);
    this.uploadGateway.emitFilesUpdated(email);
    return result;
  }
}
