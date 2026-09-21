import { Body, Controller, Get, Global, HttpCode, Injectable, Module, Post, Req, Res, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, MaxLength } from 'class-validator';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../../common/guards/public.decorator';

export const SESSION_COOKIE = 'sb_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

/** Signed, expiring session value: "<expiryMs>.<hmac>". Stateless, so a restart does not log you out. */
export function signSession(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): string {
  const exp = String(now + ttlMs);
  return `${exp}.${createHmac('sha256', secret).update(exp).digest('base64url')}`;
}

export function verifySession(secret: string, token: string | undefined, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac || Number(exp) < now) return false;
  const expected = createHmac('sha256', secret).update(exp).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1);
}

@Injectable()
export class AuthService {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly config: ConfigService) {}

  /** Login is only enforced when ACCESS_PASSCODE is set. */
  required(): boolean {
    return !!this.config.get<string>('ACCESS_PASSCODE');
  }

  private secret(): string {
    return this.config.get<string>('TOKEN_ENCRYPTION_KEY') || this.config.get<string>('API_TOKEN') || '';
  }

  isAuthenticated(cookieHeader: string | undefined): boolean {
    return verifySession(this.secret(), readCookie(cookieHeader, SESSION_COOKIE));
  }

  login(passcode: string, ip: string): string {
    const now = Date.now();
    const f = this.failures.get(ip);
    if (f && f.resetAt > now && f.count >= 5) throw new HttpException('Too many attempts. Wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
    const expected = createHash('sha256').update(this.config.get<string>('ACCESS_PASSCODE', '')).digest();
    const given = createHash('sha256').update(passcode).digest();
    if (!this.required() || !timingSafeEqual(expected, given)) {
      const cur = f && f.resetAt > now ? f : { count: 0, resetAt: now + 60_000 };
      this.failures.set(ip, { count: cur.count + 1, resetAt: cur.resetAt });
      throw new UnauthorizedException('Wrong passcode');
    }
    this.failures.delete(ip);
    return signSession(this.secret());
  }
}

class LoginDto {
  @IsString() @MaxLength(200) passcode!: string;
}

/** Client address for rate limiting: the last X-Forwarded-For hop is the one added by our own dev proxy. */
const clientIp = (req: Request) => {
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] ?? req.ip ?? 'unknown';
};
const isHttps = (req: Request) => String(req.headers['x-forwarded-proto'] ?? '').includes('https');

const cookie = (value: string, maxAgeSeconds: number, secure: boolean) =>
  `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('status')
  status(@Req() req: Request) {
    return { required: this.auth.required(), authenticated: !this.auth.required() || this.auth.isAuthenticated(req.headers.cookie) };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.auth.login(dto.passcode, clientIp(req));
    res.setHeader('Set-Cookie', cookie(token, SESSION_TTL_MS / 1000, isHttps(req)));
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Set-Cookie', cookie('', 0, isHttps(req)));
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
