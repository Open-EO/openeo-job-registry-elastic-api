import { Injectable } from '@nestjs/common';
import * as convict from 'convict';
import * as convict_validator from 'convict-format-with-validator';
import {
  AppConfig,
  ElasticsearchConfig,
  PostgresqlConfig,
  schema,
} from '../schema/config.schema';
import * as dotenv from 'dotenv';

@Injectable()
export class ConfigService {
  config: convict.Config<AppConfig>;

  constructor() {
    dotenv.config();
    convict.addFormats(convict_validator);
    this.config = convict(schema(process.env.JOB_STORE_TYPE));
    this.config.validate({ allowed: 'strict' });
  }

  get(configName: string) {
    return this.config.get(configName);
  }

  getElasticsearch<K extends keyof ElasticsearchConfig>(
    field: K,
  ): ElasticsearchConfig[K] {
    return this.get(`database.jobStore.elasticsearch.${field}`);
  }

  getElasticsearchHosts(): string[] {
    return this.getElasticsearch('hosts')
      .split(',')
      .map((host) => host.trim());
  }

  getPostgresql<K extends keyof PostgresqlConfig>(
    field: K,
  ): PostgresqlConfig[K] {
    return this.get(`database.jobStore.postgresql.${field}`);
  }
}
