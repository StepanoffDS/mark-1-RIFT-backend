import { DatabaseService } from '@infrastructure/database/database.service';
import { buildChangePayload } from '@libs/buildChangePayload';
import { buildUpdateChanges } from '@libs/buildUpdateChanges';
import { decodeCursor, encodeCursor } from '@libs/cursor-pagination';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { ListIncidentEventsQueryDto } from './dto/list-incident-events-query.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsRepository } from './incidents.repository';
import { type IncidentChanges, IncidentEventType } from './types';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly incidentsRepository: IncidentsRepository,
  ) {}

  list(query: ListIncidentsQueryDto) {
    return this.incidentsRepository.list(query);
  }

  async listEvents(incidentId: string, query: ListIncidentEventsQueryDto) {
    if (!(await this.incidentsRepository.findById(incidentId))) {
      throw new NotFoundException('Incident not found');
    }

    const cursor = query.cursor
      ? decodeCursor(
          query.cursor,
          (payload) => this.parseEventCursor(payload),
          'Invalid event cursor',
        )
      : undefined;
    const rows = await this.incidentsRepository.listEvents(
      incidentId,
      query.limit,
      cursor,
    );
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((event) => ({
      type: event.type,
      actor: event.actor_id
        ? { id: event.actor_id, username: event.actor_username }
        : null,
      payload: event.payload,
      createdAt: event.created_at,
    }));
    const last = rows[query.limit - 1];

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  private parseEventCursor(payload: unknown) {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('createdAt' in payload) ||
      !('id' in payload) ||
      typeof payload.createdAt !== 'string' ||
      Number.isNaN(Date.parse(payload.createdAt)) ||
      typeof payload.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        payload.id,
      )
    ) {
      throw new Error();
    }
    return { createdAt: payload.createdAt, id: payload.id };
  }

  async create(dto: CreateIncidentDto, actorId: string) {
    const title = dto.title.trim();

    if (!title) {
      throw new BadRequestException('Title cannot be empty');
    }

    try {
      return await this.databaseService.transaction(async (client) => {
        const incident = await this.incidentsRepository.create(client, {
          title,
          description: dto.description?.trim() || null,
          severity: dto.severity,
          createdBy: actorId,
          assignedTo: dto.assignedTo ?? null,
        });

        await this.incidentsRepository.createEvent(
          client,
          incident.id,
          actorId,
          IncidentEventType.INCIDENT_CREATED,
          {
            title: incident.title,
            severity: incident.severity,
            assignedTo: incident.assigned_to,
          },
        );

        return incident;
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new BadRequestException('Assigned user does not exist');
      }

      throw error;
    }
  }

  async update(id: string, dto: UpdateIncidentDto, actorId: string) {
    const changes = this.normalizeChanges(dto);

    if (changes.title !== undefined && !changes.title) {
      throw new BadRequestException('Title cannot be empty');
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    try {
      return await this.databaseService.transaction(async (client) => {
        const previous = await this.incidentsRepository.findByIdForUpdate(
          client,
          id,
        );

        if (!previous) {
          throw new NotFoundException('Incident not found');
        }

        const incident = await this.incidentsRepository.update(
          client,
          id,
          changes,
        );

        if (!incident) {
          throw new BadRequestException('At least one field is required');
        }

        await this.incidentsRepository.createEvent(
          client,
          incident.id,
          actorId,
          IncidentEventType.INCIDENT_UPDATED,
          buildChangePayload(changes, previous, incident, {
            title: ['title', 'title'],
            description: ['description', 'description'],
            severity: ['severity', 'severity'],
          }),
        );

        return incident;
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new BadRequestException('Assigned user does not exist');
      }

      throw error;
    }
  }

  assign(id: string, userId: string, actorId: string) {
    return this.changeAssignee(id, userId, actorId);
  }

  unassign(id: string, actorId: string) {
    return this.changeAssignee(id, null, actorId);
  }

  private async changeAssignee(
    id: string,
    userId: string | null,
    actorId: string,
  ) {
    try {
      return await this.databaseService.transaction(async (client) => {
        const previous = await this.incidentsRepository.findByIdForUpdate(
          client,
          id,
        );

        if (!previous) {
          throw new NotFoundException('Incident not found');
        }

        if (previous.assigned_to === userId) {
          return previous;
        }

        const incident = await this.incidentsRepository.update(client, id, {
          assignedTo: userId,
        });

        if (!incident) {
          throw new NotFoundException('Incident not found');
        }

        await this.incidentsRepository.createEvent(
          client,
          incident.id,
          actorId,
          userId
            ? IncidentEventType.USER_ASSIGNED
            : IncidentEventType.USER_UNASSIGNED,
          { from: previous.assigned_to, to: incident.assigned_to },
        );

        return incident;
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new BadRequestException('Assigned user does not exist');
      }

      throw error;
    }
  }

  private normalizeChanges(dto: UpdateIncidentDto): IncidentChanges {
    const changes = buildUpdateChanges<UpdateIncidentDto, IncidentChanges>(
      dto,
      {
        title: ({ title }) => title,
        description: ({ description }) => description,
        severity: ({ severity }) => severity,
      },
    );

    return changes;
  }

  private isForeignKeyViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23503'
    );
  }
}
