import { randomBytes } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { getRefreshSessionTtlMs, isProduction } from 'src/config/app-env';
import { RequestWithCookies } from 'src/config/types';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/response.dto';
import { CsrfGuard } from './guards/csrf.guard';
import { getAuthCookieName } from './lib/auth-cookie';
import { AuthCookie, type Credentials } from './types';

@UseGuards(CsrfGuard)
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('csrf')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a CSRF cookie' })
  @ApiNoContentResponse({ description: 'CSRF cookie was set.' })
  csrf(@Res({ passthrough: true }) response: Response) {
    this.setCsrfCookie(response);
  }

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Register and start a session' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiCreatedResponse({
    type: UserResponseDto,
    description: 'User created. Sets access, refresh, and CSRF cookies.',
  })
  @ApiBadRequestResponse({ description: 'Request body is invalid.' })
  @ApiConflictResponse({ description: 'Email or username is already in use.' })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  @ApiResponse({
    status: 429,
    description: 'Registration rate limit exceeded.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(
      dto.email,
      dto.username,
      dto.password,
      request.get('user-agent') ?? undefined,
    );

    this.setCredentials(response, result);
    return { user: result.user };
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({ summary: 'Log in and start a session' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiCreatedResponse({
    type: UserResponseDto,
    description: 'User authenticated. Sets access, refresh, and CSRF cookies.',
  })
  @ApiBadRequestResponse({ description: 'Request body is invalid.' })
  @ApiUnauthorizedResponse({ description: 'Email or password is invalid.' })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  @ApiResponse({ status: 429, description: 'Login rate limit exceeded.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto.email,
      dto.password,
      request.get('user-agent') ?? undefined,
    );

    this.setCredentials(response, result);
    return { user: result.user };
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Rotate the refresh token and issue a new access token',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiNoContentResponse({
    description: 'Access, refresh, and CSRF cookies were rotated.',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh session is invalid, expired, or revoked.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  @ApiResponse({ status: 429, description: 'Refresh rate limit exceeded.' })
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = await this.authService.refresh(
      request.cookies[
        getAuthCookieName(this.configService, AuthCookie.Refresh)
      ] ?? '',
    );

    this.setCredentials(response, credentials);
  }

  @Post('logout')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out from the current session' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiNoContentResponse({ description: 'Current cookies were cleared.' })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  @ApiResponse({ status: 429, description: 'Logout rate limit exceeded.' })
  async logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      request.cookies[
        getAuthCookieName(this.configService, AuthCookie.Refresh)
      ] ?? '',
    );

    this.clearCredentials(response);
  }

  private setCredentials(response: Response, credentials: Credentials) {
    const refreshMaxAge = getRefreshSessionTtlMs(this.configService);

    response.setHeader('Cache-Control', 'no-store');

    response.cookie(
      getAuthCookieName(this.configService, AuthCookie.Access),
      credentials.accessToken,
      {
        ...this.cookieOptions(true),
        maxAge:
          Number(
            this.configService.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'),
          ) * 1000,
      },
    );

    response.cookie(
      getAuthCookieName(this.configService, AuthCookie.Refresh),
      credentials.refreshToken,
      {
        ...this.cookieOptions(true),
        maxAge: refreshMaxAge,
      },
    );

    this.setCsrfCookie(response);
  }

  private setCsrfCookie(response: Response) {
    response.cookie(
      getAuthCookieName(this.configService, AuthCookie.Csrf),
      randomBytes(32).toString('base64url'),
      {
        ...this.cookieOptions(false),
        maxAge: getRefreshSessionTtlMs(this.configService),
      },
    );
  }

  private clearCredentials(response: Response) {
    response.setHeader('Cache-Control', 'no-store');

    for (const name of Object.values(AuthCookie)) {
      response.clearCookie(
        getAuthCookieName(this.configService, name),
        this.cookieOptions(name !== AuthCookie.Csrf),
      );
    }
  }

  private cookieOptions(httpOnly: boolean) {
    return {
      httpOnly,
      secure: isProduction(this.configService),
      sameSite: 'strict' as const,
      path: '/',
    };
  }
}
