import { isProduction } from '@config/app-env';
import type { ConfigService } from '@nestjs/config';

import { AuthCookie } from '../types';

export function getAuthCookieName(
  configService: ConfigService,
  cookie: AuthCookie,
) {
  return isProduction(configService)
    ? `__Host-rift_${cookie}`
    : `rift_${cookie}`;
}
