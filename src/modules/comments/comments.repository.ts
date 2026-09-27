import { DatabaseService } from '@infrastructure/database/database.service';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { CommentRow } from './types';

@Injectable()
export class CommentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  COMMENT_COLUMNS =
    'id, incident_id, author_id, content, created_at, updated_at, deleted_at';

  async incidentExists(incidentId: string, client?: PoolClient) {
    const result = client
      ? await client.query('SELECT 1 FROM incidents WHERE id = $1', [
          incidentId,
        ])
      : await this.databaseService.query(
          'SELECT 1 FROM incidents WHERE id = $1',
          [incidentId],
        );
    return result.rowCount !== 0;
  }

  async list(
    incidentId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CommentRow[]> {
    const result = await this.databaseService.query(
      `SELECT ${this.COMMENT_COLUMNS}
       FROM incident_comments
       WHERE incident_id = $1
         AND deleted_at IS NULL
         AND ($2::uuid IS NULL OR (created_at, id) < (
           SELECT created_at, id FROM incident_comments
           WHERE id = $2 AND incident_id = $1
         ))
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [incidentId, cursor ?? null, limit + 1],
    );
    return result.rows as CommentRow[];
  }

  async create(
    client: PoolClient,
    incidentId: string,
    authorId: string,
    content: string,
  ): Promise<CommentRow> {
    const result = await client.query(
      `INSERT INTO incident_comments (incident_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING ${this.COMMENT_COLUMNS}`,
      [incidentId, authorId, content],
    );
    return result.rows[0] as CommentRow;
  }

  async findById(client: PoolClient, incidentId: string, id: string) {
    const result = await client.query(
      `SELECT ${this.COMMENT_COLUMNS}
       FROM incident_comments
       WHERE incident_id = $1 AND id = $2`,
      [incidentId, id],
    );
    return (result.rows[0] as CommentRow | undefined) ?? null;
  }

  async update(client: PoolClient, id: string, content: string) {
    const result = await client.query(
      `UPDATE incident_comments
       SET content = $2, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${this.COMMENT_COLUMNS}`,
      [id, content],
    );
    return (result.rows[0] as CommentRow | undefined) ?? null;
  }

  async softDelete(client: PoolClient, id: string) {
    const result = await client.query(
      `UPDATE incident_comments
       SET deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${this.COMMENT_COLUMNS}`,
      [id],
    );
    return (result.rows[0] as CommentRow | undefined) ?? null;
  }
}
