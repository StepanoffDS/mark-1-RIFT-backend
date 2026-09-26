import { DatabaseService } from '@infrastructure/database/database.service';
import { buildChangePayload } from '@libs/buildChangePayload';
import { buildUpdateChanges } from '@libs/buildUpdateChanges';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateIncidentDto } from './dto/create-incident.dto';
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

    if (!changes.title) {
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
