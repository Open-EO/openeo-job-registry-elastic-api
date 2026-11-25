import {
  DynamicModule,
  Logger,
  Module,
  ModuleMetadata,
  Provider,
  Type,
} from '@nestjs/common';
import { JobsController } from './controllers/jobs/jobs.controller';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config/config.service';
import { DatabaseService } from './services/database/database.service';
import { CachingModule } from '../caching/caching.module';
import { JobsController as JobsV2Controller } from './controllers/jobs-v2/jobs-v2.controller';
import { JobStore } from './stores/job-store';
import { ElasticsearchJobStore } from './stores/elasticsearch/elasticsearch-job-store';
import { JobRegistryService } from './services/job-registry.service';
import { PostgresqlJobStore } from './stores/postgresql/postgresql-job-store';
import { DocumentdbJobStore } from './stores/documentdb/documentdb-job-store';
import { ElasticsearchHealthProbe } from './stores/elasticsearch/elasticsearch-health-probe';
import { HttpModule } from '@nestjs/axios';
import { JobStoreType } from './stores/job-store-types';

interface JobStoreRegistration {
  imports?: ModuleMetadata['imports'];
  controllers?: ModuleMetadata['controllers'];
  providers?: Provider[];
  store: Type<JobStore>;
}

const jobStoreRegistrations: Record<JobStoreType, () => JobStoreRegistration> =
  {
    elasticsearch: () => ({
      imports: [
        ElasticsearchModule.registerAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            nodes: configService.getElasticsearchHosts(),
          }),
          inject: [ConfigService],
        }),
        HttpModule,
      ],
      controllers: [JobsController],
      providers: [DatabaseService, ElasticsearchHealthProbe],
      store: ElasticsearchJobStore,
    }),
    postgresql: () => ({
      store: PostgresqlJobStore,
    }),
    documentdb: () => ({
      store: DocumentdbJobStore,
    }),
  };

@Module({})
export class JobsModule {
  static register(type: JobStoreType): DynamicModule {
    if (!Object.prototype.hasOwnProperty.call(jobStoreRegistrations, type)) {
      throw new Error(`Unsupported job store type: ${type}`);
    }
    const registration = jobStoreRegistrations[type]();
    return {
      module: JobsModule,
      controllers: [JobsV2Controller, ...(registration.controllers ?? [])],
      imports: [ConfigModule, CachingModule, ...(registration.imports ?? [])],
      providers: [
        ...(registration.providers ?? []),
        JobRegistryService,
        Logger,
        { provide: JobStore, useClass: registration.store },
      ],
      exports: [JobStore],
    };
  }
}
