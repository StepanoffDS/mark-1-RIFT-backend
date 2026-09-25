import type { RequestWithCookies } from '@config/types';

export type Credentials = {
  accessToken: string;
  refreshToken: string;
};

export enum AuthCookie {
  Access = 'access',
  Refresh = 'refresh',
  Csrf = 'csrf',
}

export type AccessTokenPayload = {
  sub: string;
  sid: string;
};

export type AuthenticatedRequest = RequestWithCookies & {
  user: AccessTokenPayload;
};
