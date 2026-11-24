import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { Pool } from 'pg';
import { ConfigService } from '../../../config/config/config.service';
import { PostgresqlJobStore } from './postgresql-job-store';

const databaseUrl = process.env.TEST_POSTGRES_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Flyway PostgreSQL migrations', () => {
  jest.setTimeout(60_000);
  let admin: Pool;
  let pool: Pool;
  let schema: string;
  let url: string;

  const store = (mode: 'auto' | 'verify', connectionUrl = url) => {
    const previousEnv = process.env;
    process.env = {
      ...previousEnv,
      JOB_STORE_TYPE: 'postgresql',
      POSTGRES_URL: connectionUrl,
      POSTGRES_SSL: 'false',
      POSTGRES_CA_FILE: '',
      POSTGRES_MIGRATION_MODE: mode,
    };
    try {
      return new PostgresqlJobStore(new ConfigService());
    } finally {
      process.env = previousEnv;
    }
  };

  beforeAll(() => {
    admin = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    schema = `flyway_test_${randomUUID().replace(/-/g, '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const connection = new URL(databaseUrl);
    connection.searchParams.set('options', `-c search_path=${schema}`);
    url = connection.toString();
    pool = new Pool({ connectionString: url });
  });

  afterEach(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  });

  afterAll(async () => {
    await admin.end();
  });

  it('migrates once across concurrent startups and validates the result', async () => {
    const first = store('auto');
    const second = store('auto', url.replace(/^postgresql:/, 'postgres:'));
    const verify = store('verify');
    try {
      await Promise.all([first.onModuleInit(), second.onModuleInit()]);
      await verify.onModuleInit();
      const history = await pool.query(
        'SELECT version, success FROM flyway_schema_history ORDER BY installed_rank',
      );
      expect(history.rows).toEqual([{ version: '1', success: true }]);
      await pool.query(
        `INSERT INTO job_registry_v2 (job_id, source) VALUES ('preserved', '{}')`,
      );
      await first.onModuleInit();
      expect(
        (await pool.query('SELECT job_id FROM job_registry_v2')).rows,
      ).toEqual([{ job_id: 'preserved' }]);
    } finally {
      await Promise.all(
        [first, second, verify].map((instance) => instance.onModuleDestroy()),
      );
    }
  });

  it('refuses startup in verify mode until migrations have been applied', async () => {
    const verify = store('verify');
    try {
      await expect(verify.onModuleInit()).rejects.toThrow();
    } finally {
      await verify.onModuleDestroy();
    }
  });

  it('refuses verification when the recorded migration checksum differs', async () => {
    const migrate = store('auto');
    const verify = store('verify');
    try {
      await migrate.onModuleInit();
      await pool.query(
        'UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = $1',
        ['1'],
      );
      await expect(verify.onModuleInit()).rejects.toThrow();
    } finally {
      await Promise.all([migrate.onModuleDestroy(), verify.onModuleDestroy()]);
    }
  });

  it('rejects applied versions that are missing from the migration files', async () => {
    const migrate = store('auto');
    const verify = store('verify');
    try {
      await migrate.onModuleInit();
      await pool.query(`INSERT INTO flyway_schema_history
        (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
        VALUES (2, '999', 'unknown', 'SQL', 'V999__unknown.sql', 1, current_user, 0, true)`);
      await expect(verify.onModuleInit()).rejects.toThrow();
    } finally {
      await Promise.all([migrate.onModuleDestroy(), verify.onModuleDestroy()]);
    }
  });

  it('refuses to automatically adopt a non-empty untracked schema', async () => {
    await pool.query('CREATE TABLE existing_table (id integer)');
    const instance = store('auto');
    try {
      await expect(instance.onModuleInit()).rejects.toThrow();
      expect(
        (await pool.query("SELECT to_regclass('existing_table') AS name"))
          .rows[0].name,
      ).toBe('existing_table');
    } finally {
      await instance.onModuleDestroy();
    }
  });

  it('rolls back a grouped batch when a later migration fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flyway-test-'));
    const connection = new URL(url);
    const user = decodeURIComponent(connection.username);
    const password = decodeURIComponent(connection.password);
    connection.username = '';
    connection.password = '';
    connection.protocol = 'postgresql:';
    connection.searchParams.set('sslmode', 'disable');
    try {
      await writeFile(
        join(directory, 'V1__initial.sql'),
        await readFile('sql/migrations/V1__initial.sql'),
      );
      await writeFile(
        join(directory, 'V2__valid.sql'),
        'ALTER TABLE job_registry_v2 ADD COLUMN transient text;',
      );
      await writeFile(
        join(directory, 'V3__broken.sql'),
        'SELECT invalid_column;',
      );
      await expect(
        promisify(execFile)('flyway', ['migrate'], {
          env: {
            ...process.env,
            FLYWAY_URL: `jdbc:${connection}`,
            FLYWAY_USER: user,
            FLYWAY_PASSWORD: password,
            FLYWAY_LOCATIONS: `filesystem:${directory}`,
            FLYWAY_GROUP: 'true',
          },
        }),
      ).rejects.toThrow();
      expect(
        (await pool.query("SELECT to_regclass('job_registry_v2') AS name"))
          .rows[0].name,
      ).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
