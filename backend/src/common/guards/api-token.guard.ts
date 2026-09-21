import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { AuthService } from '../../modules/auth/auth.module';
import { IS_PUBLIC } from './public.decorator';

export { IS_PUBLIC, Public } from './public.decorator';

/**
 * Protects the API. A request is allowed with either a valid login session (cookie, set after the
 * ACCESS_PASSCODE login) or the shared X-Api-Token. With neither configured, the API is open (local dev only).
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly reflector: Reflector, private readonly auth: AuthService) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    if (req.method === 'OPTIONS') return true;
    if (this.auth.isAuthenticated(req.headers.cookie)) return true;

    const expected = this.config.get<string>('API_TOKEN');
    if (!expected && !this.auth.required()) return true;
    if (expected) {
      const given = String(req.headers['x-api-token'] ?? req.query?.token ?? '');
      const a = Buffer.from(given);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    throw new UnauthorizedException(this.auth.required() ? 'Login required' : 'Invalid API token');
  }
}
