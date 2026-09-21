import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Protects the local API with a shared token (X-Api-Token header). Disabled only when API_TOKEN is empty. */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const expected = this.config.get<string>('API_TOKEN');
    if (!expected) return true;
    const req = ctx.switchToHttp().getRequest();
    if (req.method === 'OPTIONS') return true;
    const given = String(req.headers['x-api-token'] ?? req.query?.token ?? '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid API token');
    return true;
  }
}
