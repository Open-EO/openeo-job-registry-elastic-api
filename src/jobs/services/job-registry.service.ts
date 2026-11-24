import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  CreateJob,
  SearchJobs,
  JOB_FIELDS,
  ListJobs,
  ListUserJobs,
  ListActiveJobs,
  ListCleanupCandidates,
  UpdateJob,
} from '../models/job.v2.dto';
import {
  JobPage,
  JobSource,
  JobStore,
  JobStoreConflictError,
  JobStoreInvalidInputError,
  JobStoreNotFoundError,
  JobStoreUnavailableError,
  StoredJob,
  VersionedJob,
} from '../stores/job-store';

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function publicJob<T extends Partial<JobSource>>(source: T): T {
  const job = { ...source };
  delete job._registry;
  delete job.deleted;
  return job;
}

function versioned(record: StoredJob): VersionedJob {
  const job = publicJob(record.source);
  const etag = record.source._registry?.etag || hash(record.concurrencyToken);
  return {
    job,
    etag: `"${etag}"`,
  };
}

function patchAlreadyApplied(current: JobSource, update: UpdateJob): boolean {
  return Object.keys(update).every(
    (field) =>
      canonical(current[field]) === canonical(update[field as keyof UpdateJob]),
  );
}

@Injectable()
export class JobRegistryService {
  private readonly logger = new Logger(JobRegistryService.name);

  constructor(private readonly store: JobStore) {}

  private debug(event: string, details: Record<string, unknown> = {}): void {
    this.logger.debug(JSON.stringify({ event, ...details }));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof JobStoreInvalidInputError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof JobStoreNotFoundError) {
        throw new NotFoundException('Job not found');
      }
      if (error instanceof JobStoreUnavailableError) {
        throw new ServiceUnavailableException('Job storage is unavailable');
      }
      throw error;
    }
  }

  private async find(jobId: string): Promise<StoredJob> {
    const record = await this.store.get(jobId);
    if (record.source.job_id !== jobId) {
      throw new NotFoundException('Job not found');
    }
    return record;
  }

  create(input: CreateJob): Promise<VersionedJob> {
    return this.execute(async () => {
      this.debug('job_create_attempt', {
        job_id: input.job_id,
        backend_id: input.backend_id,
      });
      const creationFingerprint = hash(input);
      const now = new Date().toISOString();
      const source: JobSource = {
        ...input,
        status: input.status || 'created',
        created: input.created || now,
        updated: input.updated || now,
        _registry: { etag: randomUUID(), creationFingerprint },
      };
      try {
        const created = await this.store.create(source);
        this.debug('job_create_succeeded', { job_id: input.job_id });
        return versioned(created);
      } catch (error: unknown) {
        if (!(error instanceof JobStoreConflictError)) throw error;
        this.debug('job_create_conflict', { job_id: input.job_id });
        let found: StoredJob;
        try {
          found = await this.find(input.job_id);
        } catch (lookupError: unknown) {
          if (
            lookupError instanceof JobStoreNotFoundError ||
            lookupError instanceof NotFoundException
          ) {
            this.debug('job_create_conflict_unresolved', {
              job_id: input.job_id,
            });
            throw new ConflictException(
              'Job creation conflicted, but no existing job could be found to reconcile the request',
            );
          }
          throw lookupError;
        }
        if (found.source.backend_id !== input.backend_id) {
          this.debug('job_create_rejected', {
            job_id: input.job_id,
            reason: 'backend_mismatch',
          });
          throw new ConflictException('Job ID is already reserved');
        }
        if (found.source.deleted) {
          this.debug('job_create_rejected', {
            job_id: input.job_id,
            reason: 'deleted_job',
          });
          throw new ConflictException('Job ID belongs to a deleted job');
        }
        if (!found.source._registry?.creationFingerprint) {
          this.debug('job_create_rejected', {
            job_id: input.job_id,
            reason: 'missing_creation_fingerprint',
          });
          throw new ConflictException(
            'Original creation input is unavailable for this job',
          );
        }
        if (
          found.source._registry.creationFingerprint !== creationFingerprint
        ) {
          this.debug('job_create_rejected', {
            job_id: input.job_id,
            reason: 'creation_fingerprint_mismatch',
          });
          throw new ConflictException(
            'Job ID was created with different input',
          );
        }
        this.debug('job_create_replayed', { job_id: input.job_id });
        return versioned(found);
      }
    });
  }

  get(jobId: string): Promise<VersionedJob> {
    return this.execute(async () => {
      this.debug('job_read', { job_id: jobId });
      const record = await this.find(jobId);
      if (record.source.deleted) throw new NotFoundException('Job not found');
      return versioned(record);
    });
  }

  patch(
    jobId: string,
    update: UpdateJob,
    ifMatch?: string,
  ): Promise<VersionedJob> {
    return this.execute(() => this.mutate('patch', jobId, update, ifMatch));
  }

  delete(jobId: string, ifMatch?: string): Promise<void> {
    return this.execute(async () => {
      await this.mutate('delete', jobId, {}, ifMatch);
    });
  }

  private async mutate(
    method: 'patch' | 'delete',
    jobId: string,
    update: UpdateJob,
    ifMatch?: string,
  ): Promise<VersionedJob> {
    if (method === 'patch' && Object.keys(update).length === 0) {
      throw new BadRequestException(
        'An update must contain at least one field',
      );
    }
    const hasIfMatch = ifMatch !== undefined;
    if (hasIfMatch && !/^"[A-Za-z0-9_-]+"$/.test(ifMatch)) {
      throw new BadRequestException(
        'If-Match must contain a single strong ETag',
      );
    }
    this.debug('job_mutation_selected', {
      operation: method,
      job_id: jobId,
      mode: hasIfMatch ? 'strict' : 'unconditional',
    });
    const found = await this.find(jobId);
    if (method === 'delete' && found.source.deleted) return versioned(found);
    if (found.source.deleted) throw new NotFoundException('Job not found');
    const etagMismatch = hasIfMatch && versioned(found).etag !== ifMatch;
    if (
      method === 'patch' &&
      (!hasIfMatch || etagMismatch) &&
      patchAlreadyApplied(found.source, update)
    ) {
      this.debug('job_mutation_already_applied', {
        operation: method,
        job_id: jobId,
        mode: hasIfMatch ? 'strict' : 'unconditional',
      });
      return versioned(found);
    }
    if (etagMismatch) {
      this.debug('job_mutation_precondition_failed', {
        operation: method,
        job_id: jobId,
      });
      throw new PreconditionFailedException('Job changed; read it again');
    }
    try {
      return await this.replace(method, jobId, update, found, hasIfMatch);
    } catch (error: unknown) {
      if (!(error instanceof JobStoreConflictError)) throw error;
      this.debug('job_mutation_conflict', {
        operation: method,
        job_id: jobId,
      });
      throw new ConflictException('Job changed; retry the request');
    }
  }

  private async replace(
    method: 'patch' | 'delete',
    jobId: string,
    update: UpdateJob,
    found: StoredJob,
    strict: boolean,
  ): Promise<VersionedJob> {
    const source: JobSource = {
      ...found.source,
      ...(method === 'patch'
        ? { ...update, updated: update.updated || new Date().toISOString() }
        : { deleted: true }),
      ...(found.source._registry && {
        _registry: {
          etag: randomUUID(),
          creationFingerprint: found.source._registry.creationFingerprint,
        },
      }),
    };
    this.debug('job_mutation_write', {
      operation: method,
      job_id: jobId,
      mode: strict ? 'strict' : 'unconditional',
    });
    try {
      return versioned(
        await this.store.replace(source, found.concurrencyToken),
      );
    } catch (error: unknown) {
      if (error instanceof JobStoreConflictError) {
        if (strict) {
          throw new PreconditionFailedException('Job changed; read it again');
        }
      }
      throw error;
    }
  }

  listUserJobs(input: ListUserJobs): Promise<JobPage> {
    return this.list(input, () => ({
      filters: { backend_id: input.backend_id, user_ids: [input.user_id] },
      fields: input.fields || JOB_FIELDS.filter((field) => field !== 'process'),
      limit: input.limit,
    }));
  }

  listActiveJobs(input: ListActiveJobs): Promise<JobPage> {
    return this.list(input, () => {
      return {
        filters: {
          backend_id: input.backend_id,
          statuses: ['created', 'queued', 'running'],
          has_application_id: input.require_application_id ? true : undefined,
          infra_id: input.infra_id,
        },
        fields: input.fields,
        limit: input.limit,
      };
    });
  }

  listCleanupCandidates(input: ListCleanupCandidates): Promise<JobPage> {
    return this.list(input, () => ({
      filters: {
        backend_id: input.backend_id,
        statuses: ['queued', 'running', 'finished', 'error', 'canceled'],
        updated_until: input.updated_until,
        user_ids: input.user_ids,
      },
      fields: input.fields,
      limit: input.limit,
    }));
  }

  private list(
    input: ListJobs,
    buildSearch: () => SearchJobs,
  ): Promise<JobPage> {
    return this.execute(async () => {
      const { next_page } = input;
      const asOf = next_page?.as_of || new Date(Date.now()).toISOString();
      const cutoff = (days: number | undefined): string | undefined => {
        if (days === undefined) return undefined;
        const time = Date.parse(asOf) - days * 86400000;
        if (!Number.isFinite(time) || Math.abs(time) > 8640000000000000) {
          throw new BadRequestException(
            'Age filter is outside the supported date range',
          );
        }
        return new Date(time).toISOString();
      };
      const search = buildSearch();
      const page = await this.store.search({
        ...search,
        filters: {
          ...search.filters,
          created_since: cutoff(input.max_age),
          updated_since: cutoff(input.max_updated_ago),
        },
        position: next_page?.position,
      });
      return {
        jobs: page.jobs.map(publicJob),
        next_page:
          page.next_position === null
            ? null
            : { as_of: asOf, position: page.next_position },
      };
    });
  }
}
