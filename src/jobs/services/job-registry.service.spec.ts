import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JobRegistryService } from './job-registry.service';
import { ListJobs, SearchJobs } from '../models/job.v2.dto';
import {
  JobSource,
  JobStore,
  JobStoreConflictError,
  JobStoreInvalidInputError,
  JobStoreNotFoundError,
  JobStoreUnavailableError,
  StoredJob,
  StoredJobPage,
} from '../stores/job-store';

class MemoryJobStore extends JobStore {
  async checkHealth() {
    return { name: 'memory', status: 'up' as const };
  }

  private readonly records = new Map<string, StoredJob>();
  private writes = 0;
  conflictsRemaining = 0;
  persistentConflicts = false;
  replaceAttempts = 0;

  get writeCount(): number {
    return this.writes;
  }

  private snapshot(record: StoredJob): StoredJob {
    return JSON.parse(JSON.stringify(record));
  }

  private save(source: JobSource): StoredJob {
    this.writes++;
    const record = this.snapshot({
      source,
      concurrencyToken: `memory-token-${this.writes}`,
    });
    this.records.set(source.job_id, record);
    return this.snapshot(record);
  }

  async create(source: JobSource): Promise<StoredJob> {
    if (this.records.has(source.job_id)) throw new JobStoreConflictError();
    return this.save(source);
  }

  async get(jobId: string): Promise<StoredJob> {
    const record = this.records.get(jobId);
    if (!record) throw new JobStoreNotFoundError();
    return this.snapshot(record);
  }

  async replace(
    source: JobSource,
    concurrencyToken: string,
  ): Promise<StoredJob> {
    this.replaceAttempts++;
    if (this.persistentConflicts || this.conflictsRemaining > 0) {
      if (!this.persistentConflicts) this.conflictsRemaining--;
      throw new JobStoreConflictError();
    }
    if (
      this.records.get(source.job_id)?.concurrencyToken !== concurrencyToken
    ) {
      throw new JobStoreConflictError();
    }
    return this.save(source);
  }

  search = jest.fn<Promise<StoredJobPage>, [SearchJobs]>();
}

describe('JobRegistryService with a non-Elasticsearch store', () => {
  let store: MemoryJobStore;
  let registry: JobRegistryService;
  const input = {
    job_id: '1',
    backend_id: 'CDSE',
    user_id: 'alice',
    parent_id: 'parent-a',
    job_options: { b: 2, a: 1 },
  };
  const key = '1';

  beforeEach(() => {
    store = new MemoryJobStore();
    registry = new JobRegistryService(store);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates defaults, canonicalizes input, and hides private metadata', async () => {
    const first = await registry.create(input);
    expect(first.job).toMatchObject({ ...input, status: 'created' });
    expect(first.job.updated).toBe(first.job.created);
    expect(Number.isNaN(Date.parse(first.job.created))).toBe(false);
    expect(first.job).not.toHaveProperty('_registry');
    expect(first.job).not.toHaveProperty('deleted');
    const record = await store.get('1');
    expect(record.source._registry).toEqual({
      etag: expect.any(String),
      creationFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const replay = await registry.create({
      ...input,
      job_options: { a: 1, b: 2 },
    });
    expect(replay).toEqual(first);
    expect(await store.get('1')).toEqual(record);
  });

  it('explains when a create conflict cannot be reconciled with an existing job', async () => {
    jest.spyOn(store, 'create').mockRejectedValue(new JobStoreConflictError());
    jest.spyOn(store, 'get').mockRejectedValue(new JobStoreNotFoundError());

    await expect(registry.create(input)).rejects.toMatchObject({
      status: 409,
      message:
        'Job creation conflicted, but no existing job could be found to reconcile the request',
    });
  });

  it.each([
    { backend_id: 'OTC' },
    { parent_id: 'parent-b' },
    { user_id: 'bob' },
    { description: null },
    { job_options: { a: 1, b: 3 } },
  ])('rejects changed creation input %j without writing', async (changes) => {
    await registry.create(input);
    const record = await store.get('1');
    await expect(
      registry.create({ ...input, ...changes }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await store.get('1')).toEqual(record);
  });

  it('preserves the original fingerprint and returns current state on create retries', async () => {
    const first = await registry.create(input);
    const original = await store.get('1');
    const changed = await registry.patch(
      key,
      { status: 'running', usage: { cpu: { value: 1 } } },
      first.etag,
    );
    const next = await registry.patch(
      key,
      { usage: { ram: { value: 2 } } },
      changed.etag,
    );
    expect(next.job.usage).toEqual({ ram: { value: 2 } });
    expect(next.etag).not.toBe(changed.etag);
    expect((await store.get('1')).source._registry.creationFingerprint).toBe(
      original.source._registry.creationFingerprint,
    );
    expect(await registry.create(input)).toEqual(next);
    await expect(
      registry.create({ ...input, status: 'running' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('gets jobs by globally unique job ID', async () => {
    const first = await registry.create(input);
    expect(await registry.get(key)).toEqual(first);
    await expect(registry.get('absent')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('accepts only one concurrent writer using store-enforced compare-and-swap', async () => {
    const first = await registry.create(input);
    const results = await Promise.allSettled(
      (['running', 'queued'] as const).map((status) =>
        registry.patch(key, { status }, first.etag),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(failures[0].reason).toBeInstanceOf(PreconditionFailedException);
    await expect(
      registry.patch(key, { status: 'finished' }, first.etag),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('invalidates old ETags when v2 writes restore an earlier field value', async () => {
    const first = await registry.create(input);
    const intermediate = await registry.patch(
      key,
      { status: 'running' },
      first.etag,
    );
    const current = await registry.patch(
      key,
      { status: 'created' },
      intermediate.etag,
    );
    expect(current.job.status).toBe(first.job.status);
    expect(current.etag).not.toBe(first.etag);
    await expect(
      registry.patch(key, { status: 'finished' }, first.etag),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('keeps legacy jobs without registry metadata readable and mutable without inventing a creation fingerprint', async () => {
    await store.create({ ...input, status: 'created' });
    const first = await registry.get(key);
    const changed = await registry.patch(key, { title: 'updated' }, first.etag);
    expect(changed.job.title).toBe('updated');
    expect(changed.etag).not.toBe(first.etag);
    expect((await store.get(key)).source._registry).toBeUndefined();
    await expect(registry.create(input)).rejects.toMatchObject({
      status: 409,
      message: 'Original creation input is unavailable for this job',
    });
  });

  it('derives ETags from the storage revision', async () => {
    await registry.create(input);
    const response = await registry.get(key);
    expect(response.etag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it('treats equivalent timestamp representations as an already-applied patch', async () => {
    const first = await registry.create(input);
    const started = '2026-11-10T12:00:00Z';
    const changed = await registry.patch(key, { started }, first.etag);
    const writes = store.writeCount;

    await expect(
      registry.patch(key, { started: '2026-11-10T12:00:00.000Z' }, first.etag),
    ).resolves.toEqual(changed);
    await expect(
      registry.patch(key, { started: '2026-11-10T12:00:00.000Z' }),
    ).resolves.toEqual(changed);
    expect(store.writeCount).toBe(writes);
  });

  it('soft-deletes without allowing retries to overwrite or resurrect the job', async () => {
    const first = await registry.create(input);
    await registry.delete(key, first.etag);
    expect((await store.get('1')).source.deleted).toBe(true);
    await expect(registry.get(key)).rejects.toBeInstanceOf(NotFoundException);
    await expect(registry.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(registry.delete(key, first.etag)).resolves.toBeUndefined();
    expect(store.writeCount).toBe(2);
  });

  it('allows PATCH and DELETE without If-Match', async () => {
    await registry.create(input);
    await expect(
      registry.patch(key, { title: 'stateless' }, undefined),
    ).resolves.toMatchObject({ job: { title: 'stateless' } });
    await expect(registry.delete(key, undefined)).resolves.toBeUndefined();
    const writes = store.writeCount;
    await expect(registry.delete(key, undefined)).resolves.toBeUndefined();
    expect(store.writeCount).toBe(writes);
    await expect(registry.delete('missing', undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the current job for a strict retry already applied without another write', async () => {
    const first = await registry.create(input);
    const changed = await registry.patch(key, { status: 'queued' }, first.etag);
    const writes = store.writeCount;
    await expect(
      registry.patch(key, { status: 'queued' }, first.etag),
    ).resolves.toEqual(changed);
    expect(store.writeCount).toBe(writes);
  });

  it('returns 412 for a strict stale retry with a different patch', async () => {
    const first = await registry.create(input);
    await registry.patch(key, { status: 'queued' }, first.etag);
    await expect(
      registry.patch(key, { status: 'running' }, first.etag),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('returns 204 for a DELETE retry with an old ETag and performs no extra write', async () => {
    const first = await registry.create(input);
    await registry.delete(key, first.etag);
    const writes = store.writeCount;
    await expect(registry.delete(key, first.etag)).resolves.toBeUndefined();
    expect(store.writeCount).toBe(writes);
  });

  it.each(['patch', 'delete'] as const)(
    'does not retry a strict %s after a storage conflict',
    async (method) => {
      const first = await registry.create(input);
      store.persistentConflicts = true;
      const operation =
        method === 'patch'
          ? registry.patch(key, { title: 'updated' }, first.etag)
          : registry.delete(key, first.etag);

      await expect(operation).rejects.toBeInstanceOf(
        PreconditionFailedException,
      );
      expect(store.replaceAttempts).toBe(1);
      expect(store.writeCount).toBe(1);
    },
  );

  it.each(['unconditional', 'strict'] as const)(
    'does not enforce status transition order on the %s path',
    async (path) => {
      const created = await registry.create({ ...input, status: 'finished' });
      const options = path === 'strict' ? created.etag : undefined;

      await expect(
        registry.patch(key, { status: 'queued' }, options),
      ).resolves.toMatchObject({ job: { status: 'queued' } });
    },
  );

  it('allows the client to retry a conflicting unconditional update', async () => {
    await registry.create(input);
    store.conflictsRemaining = 1;
    await expect(registry.patch(key, { input_pixel: 1 })).rejects.toMatchObject(
      { status: 409 },
    );
    expect(store.replaceAttempts).toBe(1);
    await registry.patch(key, { usage: { ram: { value: 2 } } });
    await registry.patch(key, { input_pixel: 1 });
    const final = await registry.get(key);
    expect(final.job).toMatchObject({
      usage: { ram: { value: 2 } },
      input_pixel: 1,
    });
  });

  it('preserves concurrent updates to different fields when the client retries the conflict', async () => {
    await registry.create(input);
    const updates = [
      { usage: { ram: { value: 2 } } },
      { results_metadata_uri: 's3://results/1.json' },
    ];
    const results = await Promise.allSettled(
      updates.map((update) => registry.patch(key, update)),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const conflictIndex = results.findIndex(
      (result) => result.status === 'rejected',
    );
    expect(results[conflictIndex]).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ status: 409 }),
    });
    expect(store.replaceAttempts).toBe(2);
    await registry.patch(key, updates[conflictIndex]);
    expect((await registry.get(key)).job).toMatchObject({
      usage: { ram: { value: 2 } },
      results_metadata_uri: 's3://results/1.json',
    });
    expect(store.replaceAttempts).toBe(3);
  });

  it.each(['patch', 'delete'] as const)(
    'does not retry an unconditional %s after a storage conflict',
    async (method) => {
      await registry.create(input);
      store.persistentConflicts = true;
      const get = jest.spyOn(store, 'get');
      const operation =
        method === 'patch'
          ? registry.patch(key, { title: 'updated' })
          : registry.delete(key);
      await expect(operation).rejects.toMatchObject({
        status: 409,
        message: 'Job changed; retry the request',
      });
      expect(get).toHaveBeenCalledTimes(1);
      expect(store.replaceAttempts).toBe(1);
      expect(store.writeCount).toBe(1);
    },
  );

  it('strips internal metadata from search results even if an adapter returns it', async () => {
    await registry.create(input);
    const record = await store.get('1');
    store.search.mockResolvedValue({
      jobs: [{ ...record.source, deleted: false }],
      next_position: { created: 1000, job_id: 'j-next' },
    });
    const response = await registry.listUserJobs({
      limit: 10,
      user_id: 'alice',
    });
    expect(response.next_page).toEqual({
      as_of: expect.any(String),
      position: { created: 1000, job_id: 'j-next' },
    });
    expect(response.jobs[0]).not.toHaveProperty('_registry');
    expect(response.jobs[0]).not.toHaveProperty('deleted');
    expect((await store.get('1')).source._registry).toEqual(
      record.source._registry,
    );
  });

  it.each(['user', 'active', 'cleanup'] as const)(
    'freezes %s age cutoffs across pages even when the clock advances',
    async (kind) => {
      const time = Date.parse('2026-11-10T12:00:00Z');
      const now = jest.spyOn(Date, 'now').mockReturnValue(time);
      const query: ListJobs = {
        limit: 1,
        max_age: 30,
        max_updated_ago: 0.5,
      };
      const list = (parameters: ListJobs) => {
        if (kind === 'user')
          return registry.listUserJobs({ ...parameters, user_id: 'alice' });
        if (kind === 'cleanup')
          return registry.listCleanupCandidates({
            ...parameters,
            updated_until: '2026-11-10T01:00:00Z',
          });
        return registry.listActiveJobs({
          ...parameters,
          require_application_id: true,
        });
      };
      store.search.mockResolvedValueOnce({
        jobs: [],
        next_position: { created: 1000, job_id: 'j-next' },
      });
      const first = await list(query);
      const original = store.search.mock.calls[0][0];
      expect(
        Date.parse(original.filters.updated_since) -
          Date.parse(original.filters.created_since),
      ).toBe(29.5 * 86400000);
      expect(original.filters.created_since).toBe('2026-10-11T12:00:00.000Z');
      expect(original.filters.updated_since).toBe('2026-11-10T00:00:00.000Z');
      if (kind === 'cleanup') {
        expect(original.filters.updated_until).toBe('2026-11-10T01:00:00Z');
      }
      now.mockReturnValue(time + 86400000);
      store.search.mockResolvedValue({ jobs: [], next_position: null });
      await list({ ...query, next_page: first.next_page });
      expect(store.search.mock.calls[1][0]).toEqual({
        ...original,
        position: { created: 1000, job_id: 'j-next' },
      });
      await list({
        ...query,
        max_age: 31,
        next_page: first.next_page,
      });
      expect(store.search).toHaveBeenCalledTimes(3);
      expect(store.search.mock.calls[2][0]).toEqual({
        ...original,
        filters: {
          ...original.filters,
          created_since: '2026-10-10T12:00:00.000Z',
        },
        position: { created: 1000, job_id: 'j-next' },
      });
      now.mockRestore();
    },
  );

  it('rejects out-of-range continuation timestamps before searching', async () => {
    await expect(
      registry.listUserJobs({
        user_id: 'alice',
        limit: 10,
        next_page: {
          as_of: '2026-11-10T12:00:00.000Z',
          position: { created: 1e100, job_id: 'j-next' },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.search).not.toHaveBeenCalled();
  });

  it.each([
    [new JobStoreInvalidInputError('Invalid next_page'), BadRequestException],
    [new JobStoreUnavailableError(), ServiceUnavailableException],
  ])('maps storage errors %j to HTTP errors', async (error, expected) => {
    jest.spyOn(store, 'get').mockRejectedValue(error);
    await expect(registry.get(key)).rejects.toBeInstanceOf(expected);
  });

  it('lets the adapter reject invalid positions without exposing its errors', async () => {
    store.search.mockResolvedValueOnce({
      jobs: [],
      next_position: { created: 1000, job_id: 'j-next' },
    });
    const first = await registry.listUserJobs({ user_id: 'alice', limit: 10 });
    store.search.mockRejectedValueOnce(
      new JobStoreInvalidInputError('Invalid next_page'),
    );
    await expect(
      registry.listUserJobs({
        user_id: 'alice',
        limit: 10,
        next_page: first.next_page,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
