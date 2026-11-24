import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import * as request from 'supertest';
import { ConfigService } from '../../../config/config/config.service';
import { AuthService } from '../../../auth/services/auth.service';
import { HealthModule } from '../../../health/health.module';
import { AuthIndicator } from '../../../health/indicators/auth.indicator';
import { JobsModule } from '../../jobs.module';
import {
  JobSource,
  JobStore,
  JobStoreConflictError,
  JobStoreNotFoundError,
} from '../job-store';
import { PostgresqlJobStore } from './postgresql-job-store';

const databaseUrl = process.env.TEST_POSTGRES_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('PostgreSQL v2 job registry', () => {
  jest.setTimeout(60_000);
  let admin: Pool;
  let app: INestApplication;
  let store: PostgresqlJobStore;
  let connectionUrl: string;
  const schema = `job_test_${randomUUID().replace(/-/g, '')}`;
  const base = {
    backend_id: 'backend',
    user_id: 'alice',
    status: 'running' as const,
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    connectionUrl = url.toString();
    const previousEnv = process.env;
    process.env = {
      ...previousEnv,
      JOB_STORE_TYPE: 'postgresql',
      POSTGRES_URL: url.toString(),
      POSTGRES_SSL: 'false',
      POSTGRES_CA_FILE: '',
      POSTGRES_MIGRATION_MODE: 'auto',
    };
    let config: ConfigService;
    try {
      config = new ConfigService();
    } finally {
      process.env = previousEnv;
    }
    const jobsModule = JobsModule.register('postgresql');
    const module = await Test.createTestingModule({
      imports: [jobsModule, HealthModule.register(jobsModule)],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider('BearerStrategy')
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({ getAuthGuard: () => ({ canActivate: () => true }) })
      .overrideProvider(AuthIndicator)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue({ auth: { status: 'up' } }),
      })
      .compile();
    store = module.get(JobStore) as PostgresqlJobStore;
    expect(store).toBeInstanceOf(PostgresqlJobStore);
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it('implements HTTP creation replay, strict updates, tombstones, and conflicts', async () => {
    await request(app.getHttpServer()).post('/jobs').send({}).expect(404);
    await request(app.getHttpServer())
      .post('/jobs/search')
      .send({})
      .expect(404);
    await request(app.getHttpServer()).get('/health').expect(200);
    const body = { backend_id: 'api', job_id: 'http-1', user_id: 'bob' };
    const created = await request(app.getHttpServer())
      .post('/v2/jobs')
      .send(body)
      .expect(201);
    await request(app.getHttpServer()).post('/v2/jobs').send(body).expect(201);
    await request(app.getHttpServer())
      .post('/v2/jobs')
      .send({ ...body, user_id: 'eve' })
      .expect(409);
    const updated = await request(app.getHttpServer())
      .patch('/v2/jobs/http-1')
      .set('If-Match', created.headers.etag)
      .send({ status: 'running' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/v2/jobs/http-1')
      .set('If-Match', created.headers.etag)
      .send({ status: 'finished' })
      .expect(412);
    await request(app.getHttpServer())
      .delete('/v2/jobs/http-1')
      .set('If-Match', updated.headers.etag)
      .expect(204);
    await request(app.getHttpServer()).get('/v2/jobs/http-1').expect(404);
    await request(app.getHttpServer()).delete('/v2/jobs/http-1').expect(204);
    await request(app.getHttpServer())
      .post('/v2/jobs')
      .send({ ...body, job_id: 'invalid-json', title: 'contains\u0000null' })
      .expect(400);
  });

  it('enforces atomic create and conditional replacement', async () => {
    const source: JobSource = {
      ...base,
      job_id: 'atomic',
      created: '2025-01-01T00:00:00Z',
    };
    const first = await store.create(source);
    await expect(store.create(source)).rejects.toBeInstanceOf(
      JobStoreConflictError,
    );
    const results = await Promise.allSettled([
      store.replace({ ...source, status: 'finished' }, first.concurrencyToken),
      store.replace({ ...source, status: 'error' }, first.concurrencyToken),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(store.get('absent')).rejects.toBeInstanceOf(
      JobStoreNotFoundError,
    );
  });

  it('starts the complete application in PostgreSQL mode without v1 routes', async () => {
    const previousEnv = process.env;
    process.env = {
      ...previousEnv,
      JOB_STORE_TYPE: 'postgresql',
      POSTGRES_URL: connectionUrl,
      POSTGRES_SSL: 'false',
      POSTGRES_CA_FILE: '',
      POSTGRES_MIGRATION_MODE: 'auto',
    };
    let fullApp: INestApplication;
    try {
      const { AppModule } = await import('../../../app.module');
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider('BearerStrategy')
        .useValue({})
        .overrideProvider(AuthService)
        .useValue({ getAuthGuard: () => ({ canActivate: () => true }) })
        .overrideProvider(AuthIndicator)
        .useValue({
          isHealthy: jest.fn().mockResolvedValue({ auth: { status: 'up' } }),
        })
        .compile();
      fullApp = module.createNestApplication();
      fullApp.useLogger(false);
      await fullApp.init();
      await request(fullApp.getHttpServer()).post('/jobs').send({}).expect(404);
      await request(fullApp.getHttpServer()).get('/health').expect(200);
      await request(fullApp.getHttpServer()).get('/v2/jobs/absent').expect(404);
      await request(fullApp.getHttpServer())
        .post('/v2/jobs')
        .send({ job_id: 'full-app', backend_id: 'backend', user_id: 'alice' })
        .expect(201);
      const document = SwaggerModule.createDocument(
        fullApp,
        new DocumentBuilder().build(),
      );
      expect(document.paths['/jobs']).toBeUndefined();
      expect(document.paths['/v2/jobs']).toBeDefined();
      expect(module.get(JobStore)).toBeInstanceOf(PostgresqlJobStore);
    } finally {
      if (fullApp) await fullApp.close();
      process.env = previousEnv;
    }
  });

  it('reports database health failure when the registry table is unavailable', async () => {
    await admin.query(
      `ALTER TABLE "${schema}".job_registry_v2 RENAME TO job_registry_v2_hidden`,
    );
    try {
      await expect(store.checkHealth()).resolves.toEqual({
        name: 'postgresql',
        status: 'down',
      });
      await request(app.getHttpServer()).get('/health').expect(503);
    } finally {
      await admin.query(
        `ALTER TABLE "${schema}".job_registry_v2_hidden RENAME TO job_registry_v2`,
      );
    }
  });

  it('filters, projects and paginates with timestamp ties and missing timestamps', async () => {
    const records: JobSource[] = [
      {
        ...base,
        job_id: 'p-a',
        created: '2025-01-03T00:00:00Z',
        updated: '2025-01-04T00:00:00Z',
        application_id: 'app',
        infra_id: 'infra',
      },
      {
        ...base,
        job_id: 'p-b',
        created: '2025-01-03T00:00:00Z',
        updated: '2025-01-04T00:00:00Z',
        application_id: null,
        infra_id: 'infra',
      },
      {
        ...base,
        job_id: 'p-c',
        created: '2025-01-02T00:00:00Z',
        updated: '2025-01-04T00:00:00Z',
        application_id: 'app',
        infra_id: 'infra',
      },
      {
        ...base,
        job_id: 'p-d',
        created: null,
        updated: '2025-01-04T00:00:00Z',
        application_id: 'app',
        infra_id: 'infra',
      },
      {
        ...base,
        job_id: 'p-e',
        created: null,
        updated: '2025-01-04T00:00:00Z',
        deleted: true,
      },
      {
        ...base,
        job_id: 'p-f',
        created: null,
        updated: '2025-01-04T00:00:00Z',
        application_id: 'app',
        infra_id: 'infra',
      },
    ];
    for (const record of records) await store.create(record);
    const filters = {
      backend_id: 'backend',
      user_ids: ['alice'],
      statuses: ['running'],
      infra_id: 'infra',
      updated_since: '2025-01-04T00:00:00Z',
    };
    const first = await store.search({ filters, fields: ['job_id'], limit: 1 });
    const second = await store.search({
      filters,
      fields: ['job_id'],
      limit: 1,
      position: first.next_position,
    });
    const third = await store.search({
      filters,
      fields: ['job_id'],
      limit: 1,
      position: second.next_position,
    });
    const fourth = await store.search({
      filters,
      fields: ['job_id'],
      limit: 1,
      position: third.next_position,
    });
    const fifth = await store.search({
      filters,
      fields: ['job_id'],
      limit: 1,
      position: fourth.next_position,
    });
    expect([
      first.jobs,
      second.jobs,
      third.jobs,
      fourth.jobs,
      fifth.jobs,
    ]).toEqual([
      [{ job_id: 'p-a' }],
      [{ job_id: 'p-b' }],
      [{ job_id: 'p-c' }],
      [{ job_id: 'p-d' }],
      [{ job_id: 'p-f' }],
    ]);
    expect(fifth.next_position).toBeNull();
    const withApp = await store.search({
      filters: {
        ...filters,
        has_application_id: true,
        created_until: '2025-01-03T00:00:00Z',
      },
      limit: 10,
    });
    expect(withApp.jobs.map((job) => job.job_id)).toEqual(['p-a', 'p-c']);
    const withoutApp = await store.search({
      filters: { ...filters, has_application_id: false },
      limit: 10,
    });
    expect(withoutApp.jobs.map((job) => job.job_id)).toEqual(['p-b']);
    await store.checkHealth();
    const listing = await request(app.getHttpServer())
      .post('/v2/jobs/active')
      .send({
        backend_id: 'backend',
        infra_id: 'infra',
        limit: 2,
        fields: ['job_id'],
      })
      .expect(200);
    expect(listing.body.jobs).toEqual([{ job_id: 'p-a' }, { job_id: 'p-b' }]);
    const next = await request(app.getHttpServer())
      .post('/v2/jobs/active')
      .send({
        backend_id: 'backend',
        infra_id: 'infra',
        limit: 2,
        fields: ['job_id'],
        next_page: listing.body.next_page,
      })
      .expect(200);
    expect(next.body.jobs).toEqual([{ job_id: 'p-c' }, { job_id: 'p-d' }]);
  });
});
