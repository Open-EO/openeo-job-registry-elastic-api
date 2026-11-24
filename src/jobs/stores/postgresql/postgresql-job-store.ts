import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'fs';
import { DatabaseError, Pool } from 'pg';
import { ConfigService } from '../../../config/config/config.service';
import { JOB_FIELDS, Job, SearchJobs } from '../../models/job.v2.dto';
import {
  JobSource,
  JobStore,
  JobStoreConflictError,
  JobStoreInvalidInputError,
  JobStoreHealth,
  JobStoreNotFoundError,
  JobStoreUnavailableError,
  StoredJob,
  StoredJobPage,
} from '../job-store';

const JOB_JSON_FIELDS = new Set<keyof Job>([
  'process',
  'job_options',
  'dependencies',
  'usage',
  'results_metadata',
  'links',
  'assets',
  'unique_process_ids',
]);

interface JobRow
  extends Omit<Job, 'created' | 'updated' | 'started' | 'finished'> {
  created: Date | null;
  updated: Date | null;
  started: Date | null;
  finished: Date | null;
  version: string;
  deleted: boolean;
  present_fields: (keyof Job | 'deleted')[];
  registry_etag: string | null;
  creation_fingerprint: string | null;
}

@Injectable()
export class PostgresqlJobStore extends JobStore implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    super();
    this.logger = new Logger(PostgresqlJobStore.name);
    const connectionString = config.getPostgresql('url');
    const ssl = config.getPostgresql('ssl');
    const caFile = config.getPostgresql('caFile');
    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      ssl: ssl
        ? {
            rejectUnauthorized: true,
            ...(caFile ? { ca: readFileSync(caFile, 'utf8') } : {}),
          }
        : false,
    });
    this.pool.on('error', () =>
      this.logger.error('PostgreSQL connection failed'),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async checkHealth(): Promise<JobStoreHealth> {
    try {
      await this.pool.query('SELECT job_id FROM job_registry_v2 LIMIT 0');
      return { name: 'postgresql', status: 'up' };
    } catch {
      this.logger.error('PostgreSQL job storage health check failed');
      return { name: 'postgresql', status: 'down' };
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (
        error instanceof JobStoreConflictError ||
        error instanceof JobStoreInvalidInputError ||
        error instanceof JobStoreNotFoundError
      ) {
        throw error;
      }
      if (error instanceof DatabaseError && error.code === '23505') {
        throw new JobStoreConflictError();
      }
      if (
        error instanceof DatabaseError &&
        ['22P05', '22021'].includes(error.code)
      ) {
        throw new JobStoreInvalidInputError(
          'Job contains characters unsupported by PostgreSQL',
        );
      }

      this.logger.error('PostgreSQL job storage operation failed');
      throw new JobStoreUnavailableError();
    }
  }

  private record(row: JobRow): StoredJob {
    const source: JobSource = {
      job_id: row.job_id,
      backend_id: row.backend_id,
      user_id: row.user_id,
    };
    for (const field of row.present_fields) {
      if (field === 'deleted') {
        source.deleted = row.deleted;
      } else if (
        field !== 'job_id' &&
        field !== 'backend_id' &&
        field !== 'user_id'
      ) {
        const value = row[field];
        Object.assign(source, {
          [field]: value instanceof Date ? value.toISOString() : value,
        });
      }
    }
    if (row.deleted) source.deleted = true;
    if (row.registry_etag && row.creation_fingerprint) {
      source._registry = {
        etag: row.registry_etag,
        creationFingerprint: row.creation_fingerprint,
      };
    }
    return { source, concurrencyToken: row.version };
  }

  private timestamp(value: string | null | undefined): Date | null {
    if (value == null) return null;
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.getTime()))
      throw new Error('Invalid job timestamp');
    return timestamp;
  }

  private jobValues(source: JobSource, fields: (keyof Job)[]): unknown[] {
    return fields.map((field) => {
      switch (field) {
        case 'created':
          return this.timestamp(source.created);
        case 'updated':
          return this.timestamp(source.updated);
        case 'started':
          return this.timestamp(source.started);
        case 'finished':
          return this.timestamp(source.finished);
      }
      const value = source[field];
      if (JOB_JSON_FIELDS.has(field)) {
        return value === undefined || value === null
          ? value
          : JSON.stringify(value);
      }
      return value;
    });
  }

  create(source: JobSource): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_create', source.job_id);
      const columns = [
        ...JOB_FIELDS,
        'present_fields',
        'deleted',
        'registry_etag',
        'creation_fingerprint',
      ];
      const values = [
        ...this.jobValues(source, JOB_FIELDS),
        [
          ...JOB_FIELDS.filter((field) => source[field] !== undefined),
          ...(source.deleted !== undefined ? ['deleted'] : []),
        ],
        source.deleted ?? false,
        source._registry?.etag ?? null,
        source._registry?.creationFingerprint ?? null,
      ];
      const { rows } = await this.pool.query<JobRow>(
        `INSERT INTO job_registry_v2 (${columns.join(', ')})
         VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
         RETURNING *`,
        values,
      );
      return this.record(rows[0]);
    });
  }

  get(jobId: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_get', jobId);
      const { rows } = await this.pool.query<JobRow>(
        'SELECT * FROM job_registry_v2 WHERE job_id = $1',
        [jobId],
      );
      if (!rows.length) throw new JobStoreNotFoundError();
      return this.record(rows[0]);
    });
  }

  replace(source: JobSource, concurrencyToken: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_replace', source.job_id);
      if (!/^[1-9]\d*$/.test(concurrencyToken))
        throw new Error('Invalid concurrency token');
      const fields = JOB_FIELDS.filter((field) => field !== 'job_id');
      const columns = [
        ...fields,
        'present_fields',
        'deleted',
        'registry_etag',
        'creation_fingerprint',
      ];
      const values = [
        ...this.jobValues(source, fields),
        [
          ...JOB_FIELDS.filter((field) => source[field] !== undefined),
          ...(source.deleted !== undefined ? ['deleted'] : []),
        ],
        source.deleted ?? false,
        source._registry?.etag ?? null,
        source._registry?.creationFingerprint ?? null,
        source.job_id,
        concurrencyToken,
      ];
      const { rows } = await this.pool.query<JobRow>(
        `UPDATE job_registry_v2
         SET ${columns
           .map((column, index) => `${column} = $${index + 1}`)
           .join(', ')},
             version = version + 1
         WHERE job_id = $${values.length - 1} AND version = $${
          values.length
        }::bigint
         RETURNING *`,
        values,
      );
      if (!rows.length) throw new JobStoreConflictError();
      return this.record(rows[0]);
    });
  }

  search(search: SearchJobs): Promise<StoredJobPage> {
    return this.execute(async () => {
      this.debug('job_store_search');
      const filters = search.filters || {};
      const values: unknown[] = [];
      const param = (value: unknown): string => {
        values.push(value);
        return `$${values.length}`;
      };
      const where = ['deleted = false'];
      for (const [field, value] of [
        ['backend_id', filters.backend_id],
        ['job_id', filters.job_id],
        ['infra_id', filters.infra_id],
      ] as const) {
        if (value !== undefined) where.push(`${field} = ${param(value)}`);
      }
      for (const [field, value] of [
        ['user_id', filters.user_ids],
        ['status', filters.statuses],
      ] as const) {
        if (value !== undefined)
          where.push(`${field} = ANY(${param(value)}::text[])`);
      }
      if (filters.has_application_id !== undefined) {
        where.push(
          `application_id IS ${filters.has_application_id ? 'NOT ' : ''}NULL`,
        );
      }
      for (const [field, since, until] of [
        ['created', filters.created_since, filters.created_until],
        ['updated', filters.updated_since, filters.updated_until],
      ] as const) {
        if (since !== undefined)
          where.push(`${field} >= ${param(this.timestamp(since))}`);
        if (until !== undefined)
          where.push(`${field} <= ${param(this.timestamp(until))}`);
      }
      if (search.position) {
        const { created, job_id } = search.position;
        if (job_id === null) {
          throw new JobStoreInvalidInputError(
            'PostgreSQL pagination requires a job ID',
          );
        }
        const idParam = param(job_id);
        if (created === null) {
          where.push(`created IS NULL AND job_id > ${idParam} COLLATE "C"`);
        } else {
          const createdParam = param(new Date(created));
          where.push(
            `(created < ${createdParam} OR created IS NULL OR (created = ${createdParam} AND job_id > ${idParam} COLLATE "C"))`,
          );
        }
      }
      const limit = param(search.limit + 1);
      const { rows } = await this.pool.query<JobRow>(
        `SELECT * FROM job_registry_v2
         WHERE ${where.join(
           ' AND ',
         )} ORDER BY created DESC NULLS LAST, job_id ASC LIMIT ${limit}`,
        values,
      );
      const page = rows.slice(0, search.limit);
      const last = page[page.length - 1];
      return {
        jobs: page.map((row) => {
          const { source } = this.record(row);
          if (!search.fields) return source;
          const result: Partial<Job> = {};
          for (const field of search.fields) {
            if (Object.prototype.hasOwnProperty.call(source, field)) {
              Object.assign(result, { [field]: source[field] });
            }
          }
          return result;
        }),
        next_position:
          rows.length > search.limit
            ? {
                created: last.created === null ? null : last.created.getTime(),
                job_id: last.job_id,
              }
            : null,
      };
    });
  }
}
