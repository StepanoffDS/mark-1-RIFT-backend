import { timingSafeEqual } from 'node:crypto';

import type { RequestWithCookies } from '@config/types';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getAuthCookieName } from '../lib/auth-cookie';
import { AuthCookie } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest<RequestWithCookies>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.get('origin');
    const expectedOrigin = this.configService.getOrThrow<string>('CORS_ORIGIN');

    if (origin !== expectedOrigin) {
      throw new ForbiddenException('Invalid request origin');
    }

    const cookieName = getAuthCookieName(this.configService, AuthCookie.Csrf);

    const cookieToken = request.cookies[cookieName] as string;
    const headerToken = request.get('x-csrf-token');

    if (
      !cookieToken ||
      !headerToken ||
      !this.tokensMatch(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }

  private tokensMatch(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
