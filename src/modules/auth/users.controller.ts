import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SessionsResponseDto, UserResponseDto } from './dto/response.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { SessionsRepository } from './sessions.repository';
import { AuthenticatedRequest } from './types';
import { UsersRepository } from './users.repository';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiOperation({ summary: 'Get the current user' })
  @ApiCookieAuth('accessCookie')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  async me(@Req() request: AuthenticatedRequest) {
    const user = await this.usersRepository.findById(request.user.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return { user };
  }

  @Get('me/sessions')
  @UseGuards(AccessTokenGuard)
  @ApiOperation({ summary: 'List active sessions for the current user' })
  @ApiCookieAuth('accessCookie')
  @ApiOkResponse({ type: SessionsResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  async sessions(@Req() request: AuthenticatedRequest) {
    const sessions = await this.sessionsRepository.findActiveByUserId(
      request.user.sub,
    );

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        userAgent: session.user_agent,
        createdAt: session.created_at,
        lastUsedAt: session.last_used_at,
        expiresAt: session.expires_at,
        current: session.id === request.user.sid,
      })),
    };
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Revoke another active session' })
  @ApiCookieAuth('accessCookie')
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiParam({ name: 'sessionId', format: 'uuid' })
  @ApiNoContentResponse({
    description: 'Session revoked or was already inactive.',
  })
  @ApiBadRequestResponse({
    description: 'The current session must use POST /auth/logout.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  async revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    if (sessionId === request.user.sid) {
      throw new BadRequestException('Use /auth/logout for the current session');
    }

    await this.sessionsRepository.revokeByIdAndUserId(
      sessionId,
      request.user.sub,
    );
  }
}
