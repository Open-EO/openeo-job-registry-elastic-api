import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { DatabaseError, Pool } from 'pg';
import { ConfigService } from '../../../config/config/config.service';
import { PostgresqlConfig } from '../../../config/schema/config.schema';
import { Job, SearchJobs } from '../../models/job.v2.dto';
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

interface JobRow {
  source: JobSource;
  version: string;
  created_ms: string | null;
  job_id: string;
}

@Injectable()
export class PostgresqlJobStore
  extends JobStore
  implements OnModuleDestroy, OnModuleInit
{
  private readonly pool: Pool;
  private readonly migrationMode: PostgresqlConfig['migrationMode'];
  private readonly flywayEnvironment: NodeJS.ProcessEnv;

  constructor(config: ConfigService) {
    super();
    this.logger = new Logger(PostgresqlJobStore.name);
    const connectionString = config.getPostgresql('url');
    const ssl = config.getPostgresql('ssl');
    const caFile = config.getPostgresql('caFile');
    this.migrationMode = config.getPostgresql('migrationMode');
    const url = new URL(connectionString);
    const user =
      url.searchParams.get('user') ?? decodeURIComponent(url.username);
    const password =
      url.searchParams.get('password') ?? decodeURIComponent(url.password);
    url.protocol = 'postgresql:';
    url.username = '';
    url.password = '';
    url.searchParams.delete('user');
    url.searchParams.delete('password');
    url.searchParams.set('sslmode', ssl ? 'verify-full' : 'disable');
    if (ssl && caFile) {
      url.searchParams.set('sslrootcert', caFile);
    } else if (ssl) {
      url.searchParams.set(
        'sslfactory',
        'org.postgresql.ssl.DefaultJavaSSLFactory',
      );
    }
    this.flywayEnvironment = {
      ...process.env,
      FLYWAY_URL: `jdbc:${url.toString()}`,
      FLYWAY_USER:
        user ||
        process.env.PGUSER ||
        (process.platform === 'win32'
          ? process.env.USERNAME
          : process.env.USER) ||
        '',
      FLYWAY_PASSWORD: password || process.env.PGPASSWORD || '',
      FLYWAY_LOCATIONS: `filesystem:${join(
        process.cwd(),
        'sql',
        'migrations',
      )}`,
      FLYWAY_VALIDATE_MIGRATION_NAMING: 'true',
      FLYWAY_FAIL_ON_MISSING_LOCATIONS: 'true',
      FLYWAY_BASELINE_ON_MIGRATE: 'false',
      FLYWAY_IGNORE_MIGRATION_PATTERNS: '',
      FLYWAY_GROUP: 'true',
    };
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

  async onModuleInit(): Promise<void> {
    const { stdout } = await promisify(execFile)(
      'flyway',
      [this.migrationMode === 'auto' ? 'migrate' : 'validate'],
      { env: this.flywayEnvironment },
    );
    this.logger.log(stdout.trim());
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
    return { source: row.source, concurrencyToken: row.version };
  }

  private timestamp(value: string | null | undefined): number | null {
    if (value == null) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error('Invalid job timestamp');
    return timestamp;
  }

  create(source: JobSource): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_create', source.job_id);
      const { rows } = await this.pool.query<JobRow>(
        `INSERT INTO job_registry_v2 (job_id, source, created_ms, updated_ms)
         VALUES ($1, $2, $3, $4) RETURNING source, version, created_ms, job_id`,
        [
          source.job_id,
          JSON.stringify(source),
          this.timestamp(source.created),
          this.timestamp(source.updated),
        ],
      );
      return this.record(rows[0]);
    });
  }

  get(jobId: string): Promise<StoredJob> {
    return this.execute(async () => {
      this.debug('job_store_get', jobId);
      const { rows } = await this.pool.query<JobRow>(
        'SELECT source, version, created_ms, job_id FROM job_registry_v2 WHERE job_id = $1',
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
      const { rows } = await this.pool.query<JobRow>(
        `UPDATE job_registry_v2 SET source = $2, created_ms = $3, updated_ms = $4, version = version + 1
         WHERE job_id = $1 AND version = $5::bigint RETURNING source, version, created_ms, job_id`,
        [
          source.job_id,
          JSON.stringify(source),
          this.timestamp(source.created),
          this.timestamp(source.updated),
          concurrencyToken,
        ],
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
      const where = ["COALESCE(source->>'deleted', 'false') <> 'true'"];
      for (const [field, value] of [
        ['backend_id', filters.backend_id],
        ['job_id', filters.job_id],
        ['infra_id', filters.infra_id],
      ] as const) {
        if (value !== undefined)
          where.push(`source->>'${field}' = ${param(value)}`);
      }
      for (const [field, value] of [
        ['user_id', filters.user_ids],
        ['status', filters.statuses],
      ] as const) {
        if (value !== undefined)
          where.push(`source->>'${field}' = ANY(${param(value)}::text[])`);
      }
      if (filters.has_application_id !== undefined) {
        where.push(
          `source->>'application_id' IS ${
            filters.has_application_id ? 'NOT ' : ''
          }NULL`,
        );
      }
      for (const [field, since, until] of [
        ['created_ms', filters.created_since, filters.created_until],
        ['updated_ms', filters.updated_since, filters.updated_until],
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
          where.push(`created_ms IS NULL AND job_id > ${idParam} COLLATE "C"`);
        } else {
          const createdParam = param(created);
          where.push(
            `(created_ms < ${createdParam} OR created_ms IS NULL OR (created_ms = ${createdParam} AND job_id > ${idParam} COLLATE "C"))`,
          );
        }
      }
      const limit = param(search.limit + 1);
      const { rows } = await this.pool.query<JobRow>(
        `SELECT source, version, created_ms, job_id FROM job_registry_v2
         WHERE ${where.join(
           ' AND ',
         )} ORDER BY created_ms DESC NULLS LAST, job_id ASC LIMIT ${limit}`,
        values,
      );
      const page = rows.slice(0, search.limit);
      const last = page[page.length - 1];
      return {
        jobs: page.map(({ source }) => {
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
                created:
                  last.created_ms === null ? null : Number(last.created_ms),
                job_id: last.job_id,
              }
            : null,
      };
    });
  }
}
