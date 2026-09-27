import { DatabaseService } from '@infrastructure/database/database.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';
import {
  IncidentEventType,
  IncidentRow,
  IncidentSeverity,
  IncidentStatus,
} from './types';

const incident: IncidentRow = {
  id: 'incident-id',
  title: 'Database outage',
  description: 'Connections are exhausted',
  status: IncidentStatus.OPEN,
  severity: IncidentSeverity.P1,
  created_by: 'author-id',
  assigned_to: null,
  created_at: new Date('2026-09-27T10:00:00.000Z'),
  updated_at: new Date('2026-09-27T10:00:00.000Z'),
  resolved_at: null,
};

describe('IncidentsService', () => {
  const client = {} as PoolClient;
  let database: jest.Mocked<DatabaseService>;
  let repository: jest.Mocked<IncidentsRepository>;
  let service: IncidentsService;

  beforeEach(() => {
    database = {
      transaction: jest.fn(<T>(callback: (client: PoolClient) => Promise<T>) =>
        callback(client),
      ),
    } as unknown as jest.Mocked<DatabaseService>;
    repository = {
      list: jest.fn(),
      listEvents: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      update: jest.fn(),
      createEvent: jest.fn(),
    } as unknown as jest.Mocked<IncidentsRepository>;
    service = new IncidentsService(database, repository);
  });

  it('creates an incident and records its creation event in the transaction', async () => {
    const dto: CreateIncidentDto = {
      title: '  Database outage  ',
      description: '  Connections are exhausted  ',
      severity: IncidentSeverity.P1,
    };
    jest.spyOn(repository, 'create').mockResolvedValue(incident);

    await expect(service.create(dto, 'author-id')).resolves.toBe(incident);

    expect(repository.create.mock.calls).toContainEqual([
      client,
      {
        title: 'Database outage',
        description: 'Connections are exhausted',
        severity: IncidentSeverity.P1,
        createdBy: 'author-id',
        assignedTo: null,
      },
    ]);
    expect(repository.createEvent.mock.calls).toContainEqual([
      client,
      incident.id,
      'author-id',
      IncidentEventType.INCIDENT_CREATED,
      expect.objectContaining({ title: incident.title }),
    ]);
  });

  it('delegates list filters and pagination to the repository', async () => {
    const query = { page: 2, limit: 10 } as ListIncidentsQueryDto;
    const result = { items: [incident], page: 2, limit: 10, total: 11 };
    jest.spyOn(repository, 'list').mockResolvedValue(result);

    await expect(service.list(query)).resolves.toBe(result);
    expect(repository.list.mock.calls).toContainEqual([query]);
  });

  it('returns incident events and an encoded cursor when another page exists', async () => {
    const firstEvent = {
      id: '00000000-0000-4000-8000-000000000001',
      type: IncidentEventType.INCIDENT_UPDATED,
      actor_id: 'actor-id',
      actor_username: 'dmitry',
      payload: { title: { from: 'Old', to: 'New' } },
      created_at: new Date('2026-09-27T12:00:00.000Z'),
    };
    jest.spyOn(repository, 'findById').mockResolvedValue(incident);
    jest
      .spyOn(repository, 'listEvents')
      .mockResolvedValue([
        firstEvent,
        { ...firstEvent, id: '00000000-0000-4000-8000-000000000002' },
      ]);

    const result = await service.listEvents(incident.id, {
      limit: 1,
    });

    expect(result).toEqual({
      items: [
        {
          type: IncidentEventType.INCIDENT_UPDATED,
          actor: { id: 'actor-id', username: 'dmitry' },
          payload: firstEvent.payload,
          createdAt: firstEvent.created_at,
        },
      ],
      nextCursor: Buffer.from(
        JSON.stringify({
          createdAt: firstEvent.created_at,
          id: firstEvent.id,
        }),
      ).toString('base64url'),
    });
    expect(repository.listEvents.mock.calls).toContainEqual([
      incident.id,
      1,
      undefined,
    ]);
  });

  it('decodes the next-page cursor and handles a missing actor', async () => {
    const event = {
      id: '00000000-0000-4000-8000-000000000001',
      type: IncidentEventType.INCIDENT_CREATED,
      actor_id: null,
      actor_username: null,
      payload: {},
      created_at: new Date('2026-09-27T12:00:00.000Z'),
    };
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: '2026-09-27T12:01:00.000Z',
        id: '00000000-0000-4000-8000-000000000002',
      }),
    ).toString('base64url');
    jest.spyOn(repository, 'findById').mockResolvedValue(incident);
    jest.spyOn(repository, 'listEvents').mockResolvedValue([event]);

    await expect(
      service.listEvents(incident.id, { limit: 2, cursor }),
    ).resolves.toEqual({
      items: [
        {
          type: IncidentEventType.INCIDENT_CREATED,
          actor: null,
          payload: {},
          createdAt: event.created_at,
        },
      ],
      nextCursor: null,
    });
    expect(repository.listEvents.mock.calls).toContainEqual([
      incident.id,
      2,
      {
        createdAt: '2026-09-27T12:01:00.000Z',
        id: '00000000-0000-4000-8000-000000000002',
      },
    ]);
  });

  it('rejects an invalid event cursor and reports a missing incident', async () => {
    jest.spyOn(repository, 'findById').mockResolvedValue(incident);
    await expect(
      service.listEvents(incident.id, { limit: 50, cursor: 'invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.listEvents.mock.calls).toHaveLength(0);

    jest.spyOn(repository, 'findById').mockResolvedValue(null);
    await expect(
      service.listEvents(incident.id, { limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.listEvents.mock.calls).toHaveLength(0);
  });

  it('rejects a whitespace-only title before opening a transaction', async () => {
    await expect(
      service.create(
        { title: '   ', severity: IncidentSeverity.P1 },
        'author-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(database.transaction.mock.calls).toHaveLength(0);
  });

  it('maps foreign-key failures during creation to a bad request', async () => {
    jest
      .spyOn(repository, 'create')
      .mockRejectedValue(Object.assign(new Error(), { code: '23503' }));

    await expect(
      service.create(
        {
          title: 'Outage',
          severity: IncidentSeverity.P1,
          assignedTo: 'missing',
        },
        'author-id',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates a title and records the changed fields', async () => {
    const updated = { ...incident, title: '  New title  ' };
    jest.spyOn(repository, 'findByIdForUpdate').mockResolvedValue(incident);
    jest.spyOn(repository, 'update').mockResolvedValue({
      ...updated,
      title: 'New title',
    });

    await expect(
      service.update(incident.id, { title: '  New title  ' }, 'actor-id'),
    ).resolves.toMatchObject({ title: 'New title' });

    expect(repository.update.mock.calls).toContainEqual([
      client,
      incident.id,
      {
        title: 'New title',
      },
    ]);
    expect(repository.createEvent.mock.calls).toContainEqual([
      client,
      incident.id,
      'actor-id',
      IncidentEventType.INCIDENT_UPDATED,
      { title: { from: incident.title, to: 'New title' } },
    ]);
  });

  it('allows a partial description update without a title', async () => {
    jest.spyOn(repository, 'findByIdForUpdate').mockResolvedValue(incident);
    jest.spyOn(repository, 'update').mockResolvedValue({
      ...incident,
      description: 'Updated description',
    });

    await expect(
      service.update(
        incident.id,
        { description: ' Updated description ' },
        'actor-id',
      ),
    ).resolves.toMatchObject({ description: 'Updated description' });
  });

  it('rejects an empty update and reports a missing incident', async () => {
    await expect(
      service.update(incident.id, {}, 'actor-id'),
    ).rejects.toBeInstanceOf(BadRequestException);

    jest.spyOn(repository, 'findByIdForUpdate').mockResolvedValue(null);
    await expect(
      service.update(
        incident.id,
        { severity: IncidentSeverity.P2 },
        'actor-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a blank title in a partial update', async () => {
    await expect(
      service.update(incident.id, { title: '   ' }, 'actor-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction.mock.calls).toHaveLength(0);
  });

  it('does not create an event when the assignee is unchanged', async () => {
    jest
      .spyOn(repository, 'findByIdForUpdate')
      .mockResolvedValue({ ...incident, assigned_to: 'assignee-id' });

    await expect(
      service.assign(incident.id, 'assignee-id', 'actor-id'),
    ).resolves.toMatchObject({ assigned_to: 'assignee-id' });

    expect(repository.update.mock.calls).toHaveLength(0);
    expect(repository.createEvent.mock.calls).toHaveLength(0);
  });

  it('records assignment changes', async () => {
    jest.spyOn(repository, 'findByIdForUpdate').mockResolvedValue(incident);
    jest.spyOn(repository, 'update').mockResolvedValue({
      ...incident,
      assigned_to: 'assignee-id',
    });

    await service.assign(incident.id, 'assignee-id', 'actor-id');

    expect(repository.createEvent.mock.calls).toContainEqual([
      client,
      incident.id,
      'actor-id',
      IncidentEventType.USER_ASSIGNED,
      { from: null, to: 'assignee-id' },
    ]);
  });

  it('records unassignment and maps an unknown assignee to a bad request', async () => {
    jest
      .spyOn(repository, 'findByIdForUpdate')
      .mockResolvedValue({ ...incident, assigned_to: 'assignee-id' });
    jest.spyOn(repository, 'update').mockResolvedValue(incident);

    await service.unassign(incident.id, 'actor-id');

    expect(repository.createEvent.mock.calls).toContainEqual([
      client,
      incident.id,
      'actor-id',
      IncidentEventType.USER_UNASSIGNED,
      { from: 'assignee-id', to: null },
    ]);

    jest
      .spyOn(repository, 'update')
      .mockRejectedValue(Object.assign(new Error(), { code: '23503' }));
    await expect(
      service.assign(incident.id, 'missing-user', 'actor-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
