import { DatabaseService } from '@infrastructure/database/database.service';
import { Injectable } from '@nestjs/common';
import { type PoolClient } from 'pg';

type UserAuthRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
};

type UserRow = Omit<UserAuthRow, 'password_hash'>;

@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByEmail(email: string): Promise<UserAuthRow | null> {
    const result = await this.databaseService.query(
      `SELECT id, email, username, password_hash
        FROM users
        WHERE email = $1`,
      [email],
    );

    return (result.rows[0] as UserAuthRow | undefined) ?? null;
  }

  async create(
    client: PoolClient,
    email: string,
    username: string,
    passwordHash: string,
  ): Promise<UserRow> {
    const result = await client.query(
      `INSERT INTO users (email, username, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, email, username`,
      [email, username, passwordHash],
    );

    return result.rows[0] as UserRow;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.databaseService.query(
      `SELECT id, email, username
       FROM users
       WHERE id = $1`,
      [id],
    );

    return (result.rows[0] as UserRow | undefined) ?? null;
  }
}
