import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { DatabaseService } from 'src/infrastructure/database/database.service';
import request = require('supertest');
import type { Agent, Response } from 'supertest';
import cookieParser = require('cookie-parser');

const csrfCookieName = 'rift_csrf';

type IncidentResponse = {
  incident: { id: string; title: string; description: string | null };
};

type CommentResponse = {
  comment: { id: string; authorId: string; content: string };
};

type CommentListResponse = { items: CommentResponse['comment'][] };

describe('Incidents and comments (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let origin: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const config = app.get(ConfigService);
    if (config.getOrThrow<string>('POSTGRES_DB') !== 'mark-1-rift-test') {
      throw new Error('E2E tests must use mark-1-rift-test database');
    }

    database = app.get(DatabaseService);
    origin = config.getOrThrow<string>('CORS_ORIGIN');
  });

  beforeEach(async () => {
    await database.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an incident and applies a partial update', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrfToken = await register(agent, origin);

    await agent
      .post('/api/v1/incidents')
      .set('Origin', origin)
      .send({ title: 'Incident without CSRF', severity: 'P1' })
      .expect(403);

    const created = await agent
      .post('/api/v1/incidents')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Payment outage', severity: 'P1' })
      .expect(201);

    const createdIncident = created.body as unknown as IncidentResponse;
    const updated = await agent
      .patch(`/api/v1/incidents/${createdIncident.incident.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrfToken)
      .send({ description: 'Payments are failing' })
      .expect(200);

    const updatedIncident = updated.body as unknown as IncidentResponse;
    expect(updatedIncident.incident).toMatchObject({
      id: createdIncident.incident.id,
      title: 'Payment outage',
      description: 'Payments are failing',
    });
  });

  it('creates, lists, edits, and soft deletes comments; only the author can modify them', async () => {
    const author = request.agent(app.getHttpServer());
    const otherUser = request.agent(app.getHttpServer());
    const authorCsrf = await register(author, origin);
    const otherUserCsrf = await register(otherUser, origin);

    const incidentResponse = await author
      .post('/api/v1/incidents')
      .set('Origin', origin)
      .set('X-CSRF-Token', authorCsrf)
      .send({ title: 'Database outage', severity: 'P1' })
      .expect(201);
    const incidentBody = incidentResponse.body as unknown as IncidentResponse;
    const incidentId = incidentBody.incident.id;
    const commentsPath = `/api/v1/incidents/${incidentId}/comments`;

    await author
      .post(commentsPath)
      .set('Origin', origin)
      .send({ content: 'Missing CSRF token' })
      .expect(403);

    const created = await author
      .post(commentsPath)
      .set('Origin', origin)
      .set('X-CSRF-Token', authorCsrf)
      .send({ content: '  Connections are exhausted  ' })
      .expect(201);
    const createdComment = created.body as unknown as CommentResponse;
    const commentId = createdComment.comment.id;

    expect(createdComment.comment.content).toBe('Connections are exhausted');

    const listed = await author.get(commentsPath).expect(200);
    const listedComments = listed.body as unknown as CommentListResponse;
    expect(listedComments.items).toHaveLength(1);
    expect(listedComments.items[0]).toMatchObject({
      id: commentId,
      content: 'Connections are exhausted',
    });
    expect(typeof listedComments.items[0].authorId).toBe('string');

    await otherUser
      .patch(`${commentsPath}/${commentId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', otherUserCsrf)
      .send({ content: 'Unauthorized edit' })
      .expect(403);
    await otherUser
      .delete(`${commentsPath}/${commentId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', otherUserCsrf)
      .expect(403);

    const updated = await author
      .patch(`${commentsPath}/${commentId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', authorCsrf)
      .send({ content: 'Investigating connection pool' })
      .expect(200);
    const updatedComment = updated.body as unknown as CommentResponse;
    expect(updatedComment.comment.content).toBe(
      'Investigating connection pool',
    );

    await author
      .delete(`${commentsPath}/${commentId}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', authorCsrf)
      .expect(204);
    const afterDelete = await author.get(commentsPath).expect(200);
    const remainingComments =
      afterDelete.body as unknown as CommentListResponse;
    expect(remainingComments.items).toEqual([]);
  });
});

async function register(agent: Agent, origin: string) {
  const csrfToken = await getCsrf(agent);
  const response = await agent
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken)
    .send(credentials())
    .expect(201);
  const nextCsrfToken = cookie(response, csrfCookieName);

  if (!nextCsrfToken) throw new Error('Registration did not set CSRF cookie');
  return nextCsrfToken;
}

async function getCsrf(agent: Agent) {
  const response = await agent.get('/api/v1/auth/csrf').expect(204);
  const csrfToken = cookie(response, csrfCookieName);

  if (!csrfToken) throw new Error('CSRF endpoint did not set cookie');
  return csrfToken;
}

function cookie(response: Response, name: string) {
  return response
    .get('Set-Cookie')
    ?.find((value) => value.startsWith(`${name}=`))
    ?.split(';', 1)[0]
    .slice(name.length + 1);
}

function credentials() {
  const id = randomUUID().slice(0, 8);
  return {
    email: `e2e-${id}@example.test`,
    username: `e2e_${id}`,
    password: 'SecurePassword123!',
  };
}
