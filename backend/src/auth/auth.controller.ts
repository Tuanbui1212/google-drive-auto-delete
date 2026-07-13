import {
  Controller,
  Get,
  Delete,
  Req,
  Res,
  UseGuards,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Req() req: Request) {
    // Chuyển hướng sang Google (GoogleAuthGuard sẽ ghi đè logic ở đây)
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const user: any = req.user;
    const session = await this.authService.createSession(user);

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    const qs = new URLSearchParams({
      login: 'success',
      sessionId: session.id,
      email: session.email,
      name: session.name,
      picture: session.picture || '',
    }).toString();

    return res.redirect(`${frontendUrl}?${qs}`);
  }

  @Get('session')
  async validateSession(@Query('sessionId') sessionId: string) {
    if (!sessionId) {
      throw new UnauthorizedException('Thiếu sessionId');
    }

    return this.authService.validateSession(sessionId);
  }

  @Delete('session')
  async logout(@Query('sessionId') sessionId: string) {
    if (sessionId) {
      await this.authService.revokeSession(sessionId);
    }
    return { success: true };
  }
}
