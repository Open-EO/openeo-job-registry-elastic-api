import { JobsModule } from './jobs.module';
import { JobsController } from './controllers/jobs/jobs.controller';
import { JobsController as JobsV2Controller } from './controllers/jobs-v2/jobs-v2.controller';
import { DatabaseService } from './services/database/database.service';
import { JobStore } from './stores/job-store';
import { JobStoreType } from './stores/job-store-types';
import { ElasticsearchJobStore } from './stores/elasticsearch/elasticsearch-job-store';
import { PostgresqlJobStore } from './stores/postgresql/postgresql-job-store';
import { DocumentdbJobStore } from './stores/documentdb/documentdb-job-store';

describe('JobsModule store registration', () => {
  it('registers the Elasticsearch adapter and legacy controller', () => {
    const module = JobsModule.register('elasticsearch');
    expect(module.controllers).toEqual([JobsV2Controller, JobsController]);
    expect(module.providers).toContain(DatabaseService);
    expect(module.providers).toContainEqual({
      provide: JobStore,
      useClass: ElasticsearchJobStore,
    });
  });

  it('registers PostgreSQL without Elasticsearch legacy dependencies', () => {
    const module = JobsModule.register('postgresql');
    expect(module.controllers).toEqual([JobsV2Controller]);
    expect(module.providers).not.toContain(DatabaseService);
    expect(module.providers).toContainEqual({
      provide: JobStore,
      useClass: PostgresqlJobStore,
    });
  });

  it('registers DocumentDB without Elasticsearch legacy dependencies', () => {
    const module = JobsModule.register('documentdb');
    expect(module.controllers).toEqual([JobsV2Controller]);
    expect(module.providers).not.toContain(DatabaseService);
    expect(module.providers).toContainEqual({
      provide: JobStore,
      useClass: DocumentdbJobStore,
    });
  });

  it.each(['unknown', '__proto__'])(
    'rejects unrecognized store type %s instead of falling back',
    (value) => {
      const type: JobStoreType = JSON.parse(JSON.stringify(value));
      expect(() => JobsModule.register(type)).toThrow(
        'Unsupported job store type',
      );
    },
  );
});
