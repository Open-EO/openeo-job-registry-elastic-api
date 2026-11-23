import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request = require('supertest');
import { randomUUID } from 'crypto';
import { ConfigService } from '../src/config/config/config.service';
import { JobContinuation } from '../src/jobs/models/job.v2.dto';
import { JobsModule } from '../src/jobs/jobs.module';

describe('Jobs v2 API', () => {
  let app: INestApplication;
  let esService: ElasticsearchService;
  let configService: ConfigService;
  let index: string;
  const base = '/v2/jobs';
  const timestamp = '2026-11-09T12:00:00Z';
  const runId = randomUUID();
  const createdJobIds = new Set<string>();

  const jobId = (name: string) => {
    const id = `j-v2-${runId}-${name}`;
    createdJobIds.add(id);
    return id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [JobsModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: true,
        forbidNonWhitelisted: true,
      }),
    );
    esService = moduleFixture.get<ElasticsearchService>(ElasticsearchService);
    configService = moduleFixture.get<ConfigService>(ConfigService);
    index = configService.get('database.jobsIdx');
    await app.init();
  });

  afterAll(async () => {
    try {
      if (createdJobIds.size > 0) {
        await esService.deleteByQuery({
          index,
          refresh: true,
          body: { query: { terms: { job_id: [...createdJobIds] } } },
        });
      }
    } finally {
      if (app) await app.close();
    }
  });

  it('uses direct IDs, returns current jobs on repeated create, and rejects stale ETags', async () => {
    const search = jest.spyOn(esService, 'search');
    const directJobId = jobId('direct');
    const input = {
      job_id: directJobId,
      user_id: 'alice',
      parent_id: 'parent-a',
      created: timestamp,
      process: { process_graph: {} },
    };
    const create = () =>
      request(app.getHttpServer())
        .post(base)
        .send({ backend_id: 'qa', ...input });
    const first = await create().expect(201);
    expect(first.headers.location).toBe(`/v2/jobs/${input.job_id}`);
    const stored = await esService.get({ index, id: input.job_id });
    expect(stored.body._source.job_id).toBe(input.job_id);
    const read = await request(app.getHttpServer())
      .get(`${base}/${input.job_id}`)
      .expect(200);
    expect(read.headers.etag).toBe(first.headers.etag);
    await request(app.getHttpServer())
      .post(base)
      .send({ ...input, backend_id: 'prod' })
      .expect(409);
    const patch = () =>
      request(app.getHttpServer())
        .patch(`${base}/${input.job_id}`)
        .set('If-Match', first.headers.etag)
        .send({
          status: 'running',
          application_id: 'spark-1',
          usage: { cpu: { value: 1 } },
        });
    const running = await patch().expect(200);
    const finished = await request(app.getHttpServer())
      .patch(`${base}/${input.job_id}`)
      .set('If-Match', running.headers.etag)
      .send({ status: 'finished', usage: { ram: { value: 2 } } })
      .expect(200);
    expect(finished.body.usage).toEqual({ ram: { value: 2 } });
    expect(finished.headers.etag).not.toBe(running.headers.etag);
    await patch().expect(412);
    await request(app.getHttpServer())
      .patch(`${base}/${input.job_id}`)
      .set('If-Match', first.headers.etag)
      .send({ status: 'error' })
      .expect(412);
    await request(app.getHttpServer())
      .patch(`${base}/${input.job_id}`)
      .set('If-Match', running.headers.etag)
      .send({ status: 'error' })
      .expect(412);
    const creationReplay = await create().expect(201);
    expect(creationReplay.body).toEqual(finished.body);
    expect(creationReplay.headers.etag).toBe(finished.headers.etag);
    await request(app.getHttpServer())
      .post(base)
      .send({ backend_id: 'qa', ...input, parent_id: 'parent-b' })
      .expect(409);
    const unchanged = await esService.get({ index, id: input.job_id });
    expect(unchanged.body._version).toBe(3);
    expect(unchanged.body._source._registry).toEqual({
      etag: expect.any(String),
      creationFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const current = await request(app.getHttpServer())
      .get(`${base}/${input.job_id}`)
      .expect(200);
    expect(current.body.status).toBe('finished');
    const remove = () =>
      request(app.getHttpServer())
        .delete(`${base}/${input.job_id}`)
        .set('If-Match', finished.headers.etag);
    await remove().expect(204);
    await remove().expect(204);
    await request(app.getHttpServer())
      .get(`${base}/${input.job_id}`)
      .expect(404);
    await create().expect(409);
    await request(app.getHttpServer())
      .get(`${base}/${input.job_id}`)
      .expect(404);
    expect(search).not.toHaveBeenCalled();
    search.mockRestore();
    const listing = await request(app.getHttpServer())
      .post(`${base}/user`)
      .send({ user_id: 'alice' })
      .expect(200);
    expect(listing.body).toEqual({ jobs: [], next_page: null });
  }, 30000);

  it('supports stateless status updates without enforcing transition order', async () => {
    const statelessJobId = jobId('stateless-driver');
    await request(app.getHttpServer())
      .post(base)
      .send({ backend_id: 'qa', job_id: statelessJobId, user_id: 'alice' })
      .expect(201);
    for (const status of ['queued', 'running', 'finished']) {
      await request(app.getHttpServer())
        .patch(`${base}/${statelessJobId}`)
        .send({ status })
        .expect(200)
        .expect((response) => {
          expect(response.headers.etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
        });
    }
    await request(app.getHttpServer())
      .patch(`${base}/${statelessJobId}`)
      .send({ status: 'running' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/${statelessJobId}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('running'));
  }, 30000);

  it('atomically accepts only one writer even for identical concurrent requests', async () => {
    const raceJobId = jobId('race');
    const initial = await request(app.getHttpServer())
      .post(base)
      .send({ backend_id: 'qa', job_id: raceJobId, user_id: 'alice' })
      .expect(201);
    const responses = await Promise.all(
      ['running', 'queued'].map((status) =>
        request(app.getHttpServer())
          .patch(`${base}/${raceJobId}`)
          .set('If-Match', initial.headers.etag)
          .send({ status }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 412,
    ]);
    const current = await request(app.getHttpServer())
      .get(`${base}/${raceJobId}`)
      .expect(200);
    const identical = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .patch(`${base}/${raceJobId}`)
          .set('If-Match', current.headers.etag)
          .send({ status: 'finished' }),
      ),
    );
    expect(identical.map((response) => response.status).sort()).toEqual([
      200, 412,
    ]);
  }, 30000);

  it('changes the stored ETag on each v2 update, even when a value is restored', async () => {
    const updatedJobId = jobId('etag-update');
    const first = await request(app.getHttpServer())
      .post(base)
      .send({ backend_id: 'qa', job_id: updatedJobId, user_id: 'alice' })
      .expect(201);
    const changed = await request(app.getHttpServer())
      .patch(`${base}/${updatedJobId}`)
      .set('If-Match', first.headers.etag)
      .send({ status: 'running' })
      .expect(200);
    const restored = await request(app.getHttpServer())
      .patch(`${base}/${updatedJobId}`)
      .set('If-Match', changed.headers.etag)
      .send({ status: 'created' })
      .expect(200);
    expect(restored.body.status).toBe(first.body.status);
    expect(restored.headers.etag).not.toBe(first.headers.etag);
    expect(restored.headers.etag).not.toBe(changed.headers.etag);
    const stored = await esService.get({ index, id: updatedJobId });
    expect(restored.headers.etag).toBe(
      `"${stored.body._source._registry.etag}"`,
    );
    await request(app.getHttpServer())
      .patch(`${base}/${updatedJobId}`)
      .set('If-Match', first.headers.etag)
      .send({ status: 'error' })
      .expect(412);
  }, 30000);

  it('traverses more than 1000 records with equal timestamps without truncation', async () => {
    const manyJobs = Array.from({ length: 1001 }, (_, i) =>
      jobId(`many-${String(i).padStart(4, '0')}`),
    );
    await esService.bulk({
      refresh: 'wait_for',
      body: manyJobs.flatMap((id) => [
        { index: { _index: index, _id: id } },
        {
          backend_id: 'many',
          job_id: id,
          user_id: 'alice',
          created: timestamp,
          status: 'running',
        },
      ]),
    });
    const body = {
      backend_id: 'many',
      limit: 1000,
      fields: ['job_id'],
    };
    const first = await request(app.getHttpServer())
      .post(`${base}/active`)
      .send(body)
      .expect(200);
    expect(first.body.jobs).toHaveLength(1000);
    expect(first.body.jobs[0]).toEqual({ job_id: manyJobs[0] });
    expect(first.body.jobs[999]).toEqual({ job_id: manyJobs[999] });
    await request(app.getHttpServer())
      .post(`${base}/active`)
      .send({ ...body, next_page: first.body.next_page })
      .expect(200, {
        jobs: [{ job_id: manyJobs[1000] }],
        next_page: null,
      });
  }, 30000);

  it('searches across backends by default and supports an explicit backend filter', async () => {
    for (const backend_id of ['CDSE', 'OTC']) {
      await request(app.getHttpServer())
        .post(base)
        .send({
          job_id: jobId(`scope-${backend_id}`),
          backend_id,
          user_id: 'scope-user',
        })
        .expect(201);
    }
    const all = await request(app.getHttpServer())
      .post(`${base}/user`)
      .send({ user_id: 'scope-user' })
      .expect(200);
    expect(all.body.jobs.map((job) => job.backend_id).sort()).toEqual([
      'CDSE',
      'OTC',
    ]);
    const scoped = await request(app.getHttpServer())
      .post(`${base}/user`)
      .send({ user_id: 'scope-user', backend_id: 'CDSE' })
      .expect(200);
    expect(scoped.body.jobs).toHaveLength(1);
    expect(scoped.body.jobs[0].job_id).toBe(jobId('scope-CDSE'));
    await request(app.getHttpServer())
      .get(`${base}/${jobId('scope-OTC')}`)
      .expect(200);
  }, 30000);

  it('applies dedicated listing semantics, projects user jobs and excludes tombstones', async () => {
    const statuses = [
      'created',
      'queued',
      'running',
      'finished',
      'error',
      'canceled',
    ];
    const updated = '2026-11-09T12:00:00Z';
    const deletedJobId = jobId('list-deleted');
    await esService.bulk({
      refresh: 'wait_for',
      body: [
        ...statuses.map((status) => ({
          job_id: jobId(`list-${status}`),
          backend_id: 'listing',
          user_id: 'listing-user',
          created: updated,
          updated,
          started: '2026-11-10T12:00:00Z',
          status,
          application_id: status === 'queued' ? null : 'spark-list',
          infra_id: 'infra-list',
          process: { process_graph: {} },
        })),
        {
          job_id: deletedJobId,
          backend_id: 'listing',
          user_id: 'listing-user',
          created: updated,
          updated,
          status: 'running',
          deleted: true,
        },
      ].flatMap((job) => [{ index: { _index: index, _id: job.job_id } }, job]),
    });
    const user = await request(app.getHttpServer())
      .post(`${base}/user`)
      .send({ user_id: 'listing-user' })
      .expect(200);
    expect(user.body.jobs).toHaveLength(6);
    expect(user.body.jobs.every((job) => !('process' in job))).toBe(true);
    const projected = await request(app.getHttpServer())
      .post(`${base}/user`)
      .send({ user_id: 'listing-user', fields: ['job_id', 'process'] })
      .expect(200);
    expect(projected.body.jobs[0].process).toEqual({ process_graph: {} });
    const active = await request(app.getHttpServer())
      .post(`${base}/active`)
      .send({ backend_id: 'listing' })
      .expect(200);
    expect(active.body.jobs.map((job) => job.status).sort()).toEqual([
      'created',
      'queued',
      'running',
    ]);
    const withApplication = await request(app.getHttpServer())
      .post(`${base}/active`)
      .send({
        backend_id: 'listing',
        require_application_id: true,
        infra_id: 'infra-list',
      })
      .expect(200);
    expect(withApplication.body.jobs.map((job) => job.status).sort()).toEqual([
      'created',
      'running',
    ]);
    const cleanupQuery = {
      backend_id: 'listing',
      updated_until: updated,
      user_ids: ['listing-user'],
      fields: ['job_id', 'status'],
      limit: 2,
    };
    const collected: string[] = [];
    let next_page: JobContinuation | null = null;
    do {
      const page = await request(app.getHttpServer())
        .post(`${base}/cleanup-candidates`)
        .send({ ...cleanupQuery, ...(next_page ? { next_page } : {}) })
        .expect(200);
      collected.push(...page.body.jobs.map((job) => job.status));
      next_page = page.body.next_page;
    } while (next_page);
    expect(collected.sort()).toEqual([
      'canceled',
      'error',
      'finished',
      'queued',
      'running',
    ]);
    await request(app.getHttpServer())
      .post(`${base}/search`)
      .send({})
      .expect(404);
  }, 30000);

  it('applies active-job relative age filters for creation and last update', async () => {
    const now = Date.now();
    const daysAgo = (days: number) =>
      new Date(now - days * 86400000).toISOString();
    await esService.bulk({
      refresh: 'wait_for',
      body: [
        {
          job_id: jobId('age-recent'),
          created: daysAgo(1),
          updated: daysAgo(0.5),
        },
        {
          job_id: jobId('age-old-created'),
          created: daysAgo(40),
          updated: daysAgo(0.5),
        },
        {
          job_id: jobId('age-old-updated'),
          created: daysAgo(10),
          updated: daysAgo(8),
        },
      ].flatMap((job) => [
        { index: { _index: index, _id: job.job_id } },
        { ...job, backend_id: 'age-list', user_id: 'alice', status: 'running' },
      ]),
    });
    const page = await request(app.getHttpServer())
      .post(`${base}/active`)
      .send({ backend_id: 'age-list', max_age: 30, max_updated_ago: 7 })
      .expect(200);
    expect(page.body.jobs.map((job) => job.job_id)).toEqual([
      jobId('age-recent'),
    ]);
  }, 30000);

  it('converges identical concurrent creates and rejects different input', async () => {
    const concurrentJobId = jobId('concurrent');
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer()).post(base).send({
          backend_id: 'qa',
          job_id: concurrentJobId,
          user_id: 'alice',
        }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(responses[0].headers.etag).toBe(responses[1].headers.etag);
    await request(app.getHttpServer())
      .post(base)
      .send({ backend_id: 'qa', job_id: concurrentJobId, user_id: 'bob' })
      .expect(409);
    const stored = await esService.get({ index, id: concurrentJobId });
    expect(stored.body._version).toBe(1);
  }, 30000);

  it('accepts only one of two concurrent creates with different bodies', async () => {
    const differentInputJobId = jobId('different-input-race');
    const responses = await Promise.all(
      ['parent-a', 'parent-b'].map((parent_id) =>
        request(app.getHttpServer()).post(base).send({
          backend_id: 'qa',
          job_id: differentInputJobId,
          user_id: 'alice',
          parent_id,
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = responses.find((response) => response.status === 201);
    const current = await request(app.getHttpServer())
      .get(`${base}/${differentInputJobId}`)
      .expect(200);
    expect(current.body).toEqual(winner.body);
    expect(current.headers.etag).toBe(winner.headers.etag);
    const stored = await esService.get({ index, id: differentInputJobId });
    expect(stored.body._version).toBe(1);
  }, 30000);
});
