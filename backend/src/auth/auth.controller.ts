import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private configService: ConfigService) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Req() req: Request) {
    // Chuyển hướng sang Google (GoogleAuthGuard sẽ ghi đè logic ở đây)
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user: any = req.user;
    
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    
    // Đóng gói thông tin user truyền qua query (Cần encodeURIComponent để an toàn)
    const qs = new URLSearchParams({
      login: 'success',
      token: user.accessToken,
      email: user.email,
      name: user.firstName + ' ' + user.lastName,
      picture: user.picture
    }).toString();

    return res.redirect(`${frontendUrl}?${qs}`);
  }
}

