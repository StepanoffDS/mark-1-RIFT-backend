import { getRefreshSessionTtlMs } from '@config/app-env';
import { DatabaseService } from '@infrastructure/database/database.service';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { type PoolClient } from 'pg';

import { PasswordService } from './password.service';
import { SessionsRepository } from './sessions.repository';
import type { Credentials } from './types';
import { UsersRepository } from './users.repository';

type User = {
  id: string;
  email: string;
  username: string;
};

type AuthResult = Credentials & {
  user: User;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usersService: UsersRepository,
    private readonly sessionsService: SessionsRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    email: string,
    username: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const passwordHash = await this.passwordService.hash(password);

    try {
      return await this.databaseService.transaction(async (client) => {
        const user = await this.usersService.create(
          client,
          email.trim().toLowerCase(),
          username.trim(),
          passwordHash,
        );

        return this.createSession(client, user, userAgent);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Email or username is already in use');
      }

      throw error;
    }
  }

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(
      email.trim().toLowerCase(),
    );

    if (
      !user ||
      !(await this.passwordService.verify(user.password_hash, password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.databaseService.transaction((client) =>
      this.createSession(client, user, userAgent),
    );
  }

  async refresh(refreshToken: string): Promise<Credentials> {
    const token = this.parseRefreshToken(refreshToken);

    if (!token) {
      throw new UnauthorizedException();
    }

    return this.databaseService.transaction(async (client) => {
      const session = await this.sessionsService.findByIdForUpdate(
        client,
        token.sessionId,
      );

      if (!session || session.revoked_at || session.expires_at <= new Date()) {
        if (session && !session.revoked_at) {
          await this.sessionsService.revoke(client, session.id);
        }

        throw new UnauthorizedException();
      }

      const valid = await this.passwordService.verify(
        session.refresh_token_hash,
        token.secret,
      );

      if (!valid) {
        await this.sessionsService.revoke(client, session.id);
        throw new UnauthorizedException();
      }

      const nextSecret = this.createRefreshSecret();

      await this.sessionsService.rotate(
        client,
        session.id,
        await this.passwordService.hash(nextSecret),
      );

      return {
        accessToken: await this.createAccessToken(session.user_id, session.id),
        refreshToken: `${session.id}.${nextSecret}`,
      };
    });
  }

  async logout(refreshToken: string) {
    const token = this.parseRefreshToken(refreshToken);

    if (!token) {
      return;
    }

    await this.databaseService.transaction(async (client) => {
      const session = await this.sessionsService.findByIdForUpdate(
        client,
        token.sessionId,
      );

      if (
        session &&
        !session.revoked_at &&
        (await this.passwordService.verify(
          session.refresh_token_hash,
          token.secret,
        ))
      ) {
        await this.sessionsService.revoke(client, session.id);
      }
    });
  }

  private async createSession(
    client: PoolClient,
    user: User,
    userAgent?: string,
  ): Promise<AuthResult> {
    const refreshSecret = this.createRefreshSecret();

    const session = await this.sessionsService.create(
      client,
      user.id,
      await this.passwordService.hash(refreshSecret),
      this.refreshExpiresAt(),
      userAgent,
    );

    return {
      accessToken: await this.createAccessToken(user.id, session.id),
      refreshToken: `${session.id}.${refreshSecret}`,
      user,
    };
  }

  private createAccessToken(userId: string, sessionId: string) {
    return this.jwtService.signAsync(
      { sub: userId, sid: sessionId },
      {
        expiresIn: Number(
          this.configService.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'),
        ),
      },
    );
  }

  private refreshExpiresAt() {
    return new Date(Date.now() + getRefreshSessionTtlMs(this.configService));
  }

  private createRefreshSecret() {
    return randomBytes(32).toString('base64url');
  }

  private parseRefreshToken(token: string) {
    const [sessionId, secret, extra] = token.split('.');

    return sessionId && secret && !extra ? { sessionId, secret } : null;
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}
