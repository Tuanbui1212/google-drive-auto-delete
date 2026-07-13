import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { UserSession } from './entities/user-session.entity';

const TOKEN_REFRESH_BUFFER_MS = 15 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000;

export interface OAuthUserPayload {
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
}

export interface SessionPublicInfo {
  sessionId: string;
  email: string;
  name: string;
  picture: string | null;
  expiresAt: number;
  refreshed: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserSession)
    private sessionRepo: Repository<UserSession>,
    private configService: ConfigService,
  ) {}

  async createSession(user: OAuthUserPayload): Promise<UserSession> {
    const expiresAt = await this.resolveAccessTokenExpiry(user.accessToken);
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;

    if (!user.refreshToken) {
      this.logger.warn(
        `Đăng nhập ${user.email} không có refresh_token — token sẽ hết hạn sau ~1 giờ và bắt buộc login lại.`,
      );
    }

    const session = this.sessionRepo.create({
      id: randomUUID(),
      email: user.email,
      name,
      picture: user.picture || null,
      accessToken: user.accessToken,
      refreshToken: user.refreshToken || null,
      accessTokenExpiresAt: expiresAt,
    });

    return this.sessionRepo.save(session);
  }

  async getSessionEntity(sessionId: string): Promise<UserSession | null> {
    return this.sessionRepo.findOne({ where: { id: sessionId } });
  }

  async resolveSession(sessionId: string): Promise<UserSession> {
    if (!sessionId) {
      throw new UnauthorizedException('Thiếu session. Vui lòng đăng nhập lại.');
    }

    const session = await this.getSessionEntity(sessionId);
    if (!session) {
      throw new UnauthorizedException('Phiên đăng nhập không tồn tại. Vui lòng đăng nhập lại.');
    }

    if (this.isAccessTokenFresh(session)) {
      return session;
    }

    if (!session.refreshToken) {
      await this.revokeSession(sessionId);
      throw new UnauthorizedException(
        'Token Google đã hết hạn và không thể gia hạn. Vui lòng đăng nhập lại.',
      );
    }

    try {
      return await this.refreshSessionTokens(session);
    } catch (error: any) {
      this.logger.warn(`Refresh token thất bại cho ${session.email}: ${error.message}`);
      await this.revokeSession(sessionId);
      throw new UnauthorizedException(
        'Phiên Google đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }
  }

  async validateSession(sessionId: string): Promise<SessionPublicInfo> {
    const before = await this.getSessionEntity(sessionId);
    const session = await this.resolveSession(sessionId);

    return {
      sessionId: session.id,
      email: session.email,
      name: session.name,
      picture: session.picture,
      expiresAt: Number(session.accessTokenExpiresAt),
      refreshed: before?.accessToken !== session.accessToken,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepo.delete({ id: sessionId });
  }

  toPublicInfo(session: UserSession, refreshed = false): SessionPublicInfo {
    return {
      sessionId: session.id,
      email: session.email,
      name: session.name,
      picture: session.picture,
      expiresAt: Number(session.accessTokenExpiresAt),
      refreshed,
    };
  }

  private isAccessTokenFresh(session: UserSession): boolean {
    return Number(session.accessTokenExpiresAt) > Date.now() + TOKEN_REFRESH_BUFFER_MS;
  }

  private async resolveAccessTokenExpiry(accessToken: string): Promise<number> {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.exp) {
          return Number(data.exp) * 1000;
        }
        if (data.expires_in) {
          return Date.now() + Number(data.expires_in) * 1000;
        }
      }
    } catch (error: any) {
      this.logger.warn(`Không đọc được hạn token: ${error.message}`);
    }

    return Date.now() + DEFAULT_TOKEN_TTL_MS;
  }

  private async refreshSessionTokens(session: UserSession): Promise<UserSession> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: session.refreshToken!,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Refresh token failed');
    }

    session.accessToken = data.access_token;
    session.accessTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;

    if (data.refresh_token) {
      session.refreshToken = data.refresh_token;
    }

    this.logger.log(`Đã gia hạn token Google cho ${session.email}`);
    return this.sessionRepo.save(session);
  }
}
