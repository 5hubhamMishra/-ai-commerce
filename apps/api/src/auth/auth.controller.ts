import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * The refresh token is delivered two ways on purpose: as an httpOnly cookie (what the web
 * app uses — never touched by JS) and in the JSON body (what the mobile app persists to
 * secure storage, since React Native has no first-class httpOnly cookie jar). Both point at
 * the same server-side token record, so either path is revoked identically on logout/reuse.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body('refreshToken') bodyToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshToken(req, bodyToken);
    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_REFRESH_TOKEN',
        message: 'No refresh token provided.',
      });
    }
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Body('refreshToken') bodyToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshToken(req, bodyToken);
    if (token) await this.authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  /** cookie-parser types `req.cookies` as `any` — this is the one place that gets cast. */
  private extractRefreshToken(
    req: Request,
    bodyToken: string | undefined,
  ): string | undefined {
    const cookies = req.cookies as
      Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE] ?? bodyToken;
  }

  private setRefreshCookie(res: Response, token: string) {
    const production = process.env.NODE_ENV?.trim() === 'production';
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      // Web and API are separate Vercel origins in production, so the refresh
      // cookie must be sent with credentialed cross-site fetches. Local HTTP
      // development keeps Lax because browsers reject SameSite=None without Secure.
      secure: production,
      sameSite: production ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
