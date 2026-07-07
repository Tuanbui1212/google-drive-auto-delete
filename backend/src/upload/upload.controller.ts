import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException, Get, Query, Delete, Param } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File, 
    @Body('accessToken') accessToken: string,
    @Body('email') email: string
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!accessToken || !email) {
      throw new BadRequestException('Missing auth or email');
    }

    return this.uploadService.uploadFile(file, accessToken, email);
  }

  @Get('my-files')
  async getMyFiles(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    return this.uploadService.getMyFiles(email);
  }

  @Delete(':id')
  async deleteFile(@Param('id') id: string, @Query('email') email: string) {
    if (!email) throw new BadRequestException('Email is required');
    return this.uploadService.deleteFile(Number(id), email);
  }

  @Get('settings')
  async getSettings(@Query('email') email: string) {
    if (!email) throw new BadRequestException('Email is required');
    return this.uploadService.getUserSetting(email);
  }

  @Post('settings')
  async updateSettings(@Body() body: { email: string; delayMinutes: number }) {
    if (!body.email || body.delayMinutes === undefined) {
      throw new BadRequestException('Email and delayMinutes are required');
    }
    return this.uploadService.updateUserSetting(body.email, body.delayMinutes);
  }
}
