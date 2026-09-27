import { DatabaseService } from '@infrastructure/database/database.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';

import { CommentsGateway } from './comments.gateway';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';
import { CommentRow } from './types';

const comment: CommentRow = {
  id: 'comment-id',
  incident_id: 'incident-id',
  author_id: 'author-id',
  content: 'Database connections are exhausted.',
  created_at: new Date('2026-09-27T10:00:00.000Z'),
  updated_at: null,
  deleted_at: null,
};

describe('CommentsService', () => {
  const client = {} as PoolClient;
  let committed: boolean;
  let database: jest.Mocked<DatabaseService>;
  let repository: jest.Mocked<CommentsRepository>;
  let gateway: jest.Mocked<
    Pick<CommentsGateway, 'emitCreated' | 'emitUpdated' | 'emitDeleted'>
  >;
  let service: CommentsService;

  beforeEach(() => {
    committed = false;
    database = {
      query: jest.fn(),
      transaction: jest.fn(
        async <T>(callback: (client: PoolClient) => Promise<T>) => {
          const result = await callback(client);
          committed = true;
          return result;
        },
      ),
    } as unknown as jest.Mocked<DatabaseService>;
    repository = {
      incidentExists: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<CommentsRepository>;
    gateway = {
      emitCreated: jest.fn(() => expect(committed).toBe(true)),
      emitUpdated: jest.fn(() => expect(committed).toBe(true)),
      emitDeleted: jest.fn(() => expect(committed).toBe(true)),
    } as unknown as jest.Mocked<
      Pick<CommentsGateway, 'emitCreated' | 'emitUpdated' | 'emitDeleted'>
    >;
    service = new CommentsService(
      database,
      repository,
      gateway as unknown as CommentsGateway,
    );
  });

  it('returns a page and cursor when more comments exist', async () => {
    jest.spyOn(repository, 'incidentExists').mockResolvedValue(true);
    jest
      .spyOn(repository, 'list')
      .mockResolvedValue([comment, { ...comment, id: 'older-comment' }]);

    await expect(
      service.list('incident-id', { limit: 1, cursor: undefined }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: 'comment-id' })],
      hasMore: true,
      nextCursor: 'comment-id',
    });
    expect(repository.list.mock.calls).toContainEqual([
      'incident-id',
      undefined,
      1,
    ]);
  });

  it('returns not found for an unknown incident', async () => {
    jest.spyOn(repository, 'incidentExists').mockResolvedValue(false);

    await expect(
      service.list('missing-incident', { limit: 50, cursor: undefined }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.list.mock.calls).toHaveLength(0);
  });

  it('trims a new comment and emits only after its transaction commits', async () => {
    jest.spyOn(repository, 'incidentExists').mockResolvedValue(true);
    jest.spyOn(repository, 'create').mockResolvedValue({
      ...comment,
      content: 'New comment',
    });

    await expect(
      service.create(
        'incident-id',
        { content: '  New comment  ' },
        'author-id',
      ),
    ).resolves.toMatchObject({ content: 'New comment' });

    expect(repository.create.mock.calls).toContainEqual([
      client,
      'incident-id',
      'author-id',
      'New comment',
    ]);
    expect(gateway.emitCreated.mock.calls).toContainEqual([
      'incident-id',
      expect.objectContaining({ content: 'New comment' }),
    ]);
  });

  it('rejects a blank comment and a missing incident', async () => {
    await expect(
      service.create('incident-id', { content: '   ' }, 'author-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction.mock.calls).toHaveLength(0);

    jest.spyOn(repository, 'incidentExists').mockResolvedValue(false);
    await expect(
      service.create('missing-incident', { content: 'Comment' }, 'author-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.emitCreated.mock.calls).toHaveLength(0);
  });

  it('allows the author to edit and emits after commit', async () => {
    jest.spyOn(repository, 'findById').mockResolvedValue(comment);
    jest.spyOn(repository, 'update').mockResolvedValue({
      ...comment,
      content: 'Edited comment',
      updated_at: new Date(),
    });

    await expect(
      service.update(
        'incident-id',
        'comment-id',
        { content: ' Edited comment ' },
        'author-id',
      ),
    ).resolves.toMatchObject({ content: 'Edited comment' });
    expect(gateway.emitUpdated.mock.calls).toHaveLength(1);
  });

  it('forbids editing another author’s comment', async () => {
    jest
      .spyOn(repository, 'findById')
      .mockResolvedValue({ ...comment, author_id: 'another-user' });

    await expect(
      service.update(
        'incident-id',
        'comment-id',
        { content: 'Edited comment' },
        'author-id',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.update.mock.calls).toHaveLength(0);
    expect(gateway.emitUpdated.mock.calls).toHaveLength(0);
  });

  it('soft deletes the author’s comment and emits after commit', async () => {
    jest.spyOn(repository, 'findById').mockResolvedValue(comment);
    jest.spyOn(repository, 'softDelete').mockResolvedValue({
      ...comment,
      deleted_at: new Date(),
    });

    await expect(
      service.delete('incident-id', 'comment-id', 'author-id'),
    ).resolves.toBeUndefined();
    expect(repository.softDelete.mock.calls).toContainEqual([
      client,
      'comment-id',
    ]);
    expect(gateway.emitDeleted.mock.calls).toContainEqual([
      'incident-id',
      'comment-id',
    ]);
  });

  it('returns not found when the comment does not exist or was deleted', async () => {
    jest.spyOn(repository, 'findById').mockResolvedValue(null);
    await expect(
      service.delete('incident-id', 'missing-comment', 'author-id'),
    ).rejects.toBeInstanceOf(NotFoundException);

    jest
      .spyOn(repository, 'findById')
      .mockResolvedValue({ ...comment, deleted_at: new Date() });
    await expect(
      service.update(
        'incident-id',
        'comment-id',
        { content: 'Edit' },
        'author-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.emitDeleted.mock.calls).toHaveLength(0);
  });
});
