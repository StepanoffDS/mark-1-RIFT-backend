import { DatabaseService } from '@infrastructure/database/database.service';
import { Injectable } from '@nestjs/common';
import { type PoolClient } from 'pg';

type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

type UserSessionRow = {
  id: string;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
};

@Injectable()
export class SessionsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    client: PoolClient,
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    userAgent?: string,
  ): Promise<SessionRow> {
    const result = await client.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, refresh_token_hash, expires_at, revoked_at`,
      [userId, refreshTokenHash, expiresAt, userAgent ?? null],
    );

    return result.rows[0] as SessionRow;
  }

  async findByIdForUpdate(
    client: PoolClient,
    sessionId: string,
  ): Promise<SessionRow | null> {
    const result = await client.query(
      `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
       FROM sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId],
    );

    return (result.rows[0] as SessionRow | undefined) ?? null;
  }

  async rotate(
    client: PoolClient,
    sessionId: string,
    refreshTokenHash: string,
  ) {
    await client.query(
      `UPDATE sessions
       SET refresh_token_hash = $2, last_used_at = now()
       WHERE id = $1`,
      [sessionId, refreshTokenHash],
    );
  }

  async revoke(client: PoolClient, sessionId: string) {
    await client.query(
      `UPDATE sessions
       SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  async findActiveByUserId(userId: string): Promise<UserSessionRow[]> {
    const result = await this.databaseService.query(
      `SELECT id, user_agent, created_at, last_used_at, expires_at
       FROM sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY last_used_at DESC`,
      [userId],
    );

    return result.rows as UserSessionRow[];
  }

  async revokeByIdAndUserId(sessionId: string, userId: string) {
    await this.databaseService.query(
      `UPDATE sessions
       SET revoked_at = now()
       WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL`,
      [sessionId, userId],
    );
  }
}
