import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { MongoClient } from 'mongodb';
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
  JobStoreInvalidInputError,
  JobStoreNotFoundError,
} from '../job-store';
import { DocumentdbJobStore } from './documentdb-job-store';

const url = process.env.TEST_DOCUMENTDB_URL;
const tls = process.env.TEST_DOCUMENTDB_TLS === 'true';
const integration = url ? describe : describe.skip;

integration('DocumentDB v2 job registry', () => {
  jest.setTimeout(60_000);
  const database = `job_registry_test_${randomUUID().replace(/-/g, '')}`;
  const collection = 'jobs';
  let admin: MongoClient;
  let store: DocumentdbJobStore;
  let app: INestApplication;
  const base = {
    backend_id: 'backend',
    user_id: 'alice',
    status: 'running' as const,
  };

  beforeAll(async () => {
    admin = new MongoClient(url, { tls, retryWrites: false });
    await admin.connect();
    await admin.db(database).createCollection(collection);
    const previousEnv = process.env;
    process.env = {
      ...previousEnv,
      JOB_STORE_TYPE: 'documentdb',
      DOCUMENTDB_URL: url,
      DOCUMENTDB_DATABASE: database,
      DOCUMENTDB_COLLECTION: collection,
      DOCUMENTDB_TLS: String(tls),
    };
    let config: ConfigService;
    try {
      config = new ConfigService();
    } finally {
      process.env = previousEnv;
    }
    const jobsModule = JobsModule.register('documentdb');
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
    store = module.get(JobStore) as DocumentdbJobStore;
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
      await admin.db(database).dropDatabase();
      await admin.close();
    }
  });

  it('round-trips JSON fields and atomically enforces unique IDs and versions', async () => {
    const source: JobSource = {
      ...base,
      job_id: 'atomic',
      created: '2025-01-01T01:00:00+01:00',
      process: { 'a.b': { $value: 1 } },
      description: null,
      _registry: { etag: 'etag', creationFingerprint: 'fingerprint' },
    };
    const first = await store.create(source);
    expect(first.source).toEqual({
      ...source,
      created: '2025-01-01T00:00:00.000Z',
    });
    await expect(store.get('atomic')).resolves.toEqual(first);
    await expect(store.create(source)).rejects.toBeInstanceOf(
      JobStoreConflictError,
    );
    const results = await Promise.allSettled([
      store.replace({ ...source, status: 'finished' }, first.concurrencyToken),
      store.replace({ ...source, status: 'error' }, first.concurrencyToken),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(store.get('absent')).rejects.toBeInstanceOf(
      JobStoreNotFoundError,
    );
    await expect(
      store.create({
        ...base,
        job_id: 'oversized',
        description: 'x'.repeat(16 * 1024 * 1024),
      }),
    ).rejects.toBeInstanceOf(JobStoreInvalidInputError);
  });

  it('filters, projects and paginates ties and null timestamps', async () => {
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
    let position = undefined;
    const ids = [];
    do {
      const page = await store.search({
        filters,
        fields: ['job_id'],
        limit: 1,
        position,
      });
      ids.push(...page.jobs.map((job) => job.job_id));
      position = page.next_position;
    } while (position);
    expect(ids).toEqual(['p-a', 'p-b', 'p-c', 'p-d', 'p-f']);
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
    const absentField = await store.search({
      filters: { job_id: 'p-b' },
      fields: ['title'],
      limit: 1,
    });
    expect(absentField.jobs).toEqual([{}]);
  });

  it('implements HTTP replay, conditional writes, tombstones and listings', async () => {
    await request(app.getHttpServer()).post('/jobs').send({}).expect(404);
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
    const first = await request(app.getHttpServer())
      .post('/v2/jobs/active')
      .send({
        backend_id: 'backend',
        infra_id: 'infra',
        limit: 2,
        fields: ['job_id'],
      })
      .expect(200);
    expect(first.body.jobs).toEqual([{ job_id: 'p-a' }, { job_id: 'p-b' }]);
    const next = await request(app.getHttpServer())
      .post('/v2/jobs/active')
      .send({
        backend_id: 'backend',
        infra_id: 'infra',
        limit: 2,
        fields: ['job_id'],
        next_page: first.body.next_page,
      })
      .expect(200);
    expect(next.body.jobs).toEqual([{ job_id: 'p-c' }, { job_id: 'p-d' }]);
  });

  it('treats a missing collection like an empty collection in the read probe', async () => {
    await admin.db(database).collection(collection).rename('hidden');
    try {
      await expect(store.checkHealth()).resolves.toEqual({
        name: 'documentdb',
        status: 'up',
      });
    } finally {
      await admin.db(database).collection('hidden').rename(collection);
    }
  });
});
