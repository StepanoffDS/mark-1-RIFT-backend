import { DatabaseService } from '@infrastructure/database/database.service';
import { buildUpdateParts } from '@libs/buildUpdateParts';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { IncidentChanges, IncidentEventType, IncidentRow } from './types';
import type { IncidentSeverity } from './types';

@Injectable()
export class IncidentsRepository {
  private readonly columns = `
    id, title, description, status, severity,
    created_by, assigned_to, created_at, updated_at, resolved_at
  `;

  constructor(private readonly database: DatabaseService) {}

  async create(
    client: PoolClient,
    input: {
      title: string;
      description: string | null;
      severity: IncidentSeverity;
      createdBy: string;
      assignedTo: string | null;
    },
  ): Promise<IncidentRow> {
    const result = await client.query(
      `INSERT INTO incidents
        (title, description, severity, created_by, assigned_to)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${this.columns}`,
      [
        input.title,
        input.description,
        input.severity,
        input.createdBy,
        input.assignedTo,
      ],
    );

    return result.rows[0] as IncidentRow;
  }

  async findById(id: string): Promise<IncidentRow | null> {
    const result = await this.database.query(
      `SELECT ${this.columns}
       FROM incidents
       WHERE id = $1`,
      [id],
    );

    return (result.rows[0] as IncidentRow | undefined) ?? null;
  }

  async findByIdForUpdate(
    client: PoolClient,
    id: string,
  ): Promise<IncidentRow | null> {
    const result = await client.query(
      `SELECT ${this.columns}
       FROM incidents
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    return (result.rows[0] as IncidentRow | undefined) ?? null;
  }

  async update(
    client: PoolClient,
    id: string,
    changes: IncidentChanges,
  ): Promise<IncidentRow | null> {
    const { assignments, values } = buildUpdateParts(
      [
        ['title', changes.title],
        ['description', changes.description],
        ['severity', changes.severity],
        ['assigned_to', changes.assignedTo],
      ],
      [id],
    );

    if (assignments.length === 0) {
      return null;
    }

    const result = await client.query(
      `UPDATE incidents
       SET ${assignments.join(', ')}, updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns}`,
      values,
    );

    return (result.rows[0] as IncidentRow | undefined) ?? null;
  }

  async createEvent(
    client: PoolClient,
    incidentId: string,
    actorId: string,
    type: IncidentEventType,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO incident_events
        (incident_id, actor_id, type, payload)
       VALUES ($1, $2, $3, $4)`,
      [incidentId, actorId, type, payload],
    );
  }
}
