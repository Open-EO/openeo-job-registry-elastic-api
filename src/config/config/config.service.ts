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
import { AuthType } from '../../auth/models/authtypes.enum';

@Injectable()
export class ConfigService {
  config: convict.Config<AppConfig>;

  constructor() {
    dotenv.config();
    convict.addFormats(convict_validator);
    this.config = convict(schema(process.env.JOB_STORE_TYPE));
    this.config.validate({ allowed: 'strict' });
    this.validateEntraConfig();
    if (this.get('database.jobStore.type') === 'postgresql') {
      this.validatePostgresqlConfig();
    }
  }

  private validateEntraConfig(): void {
    if (this.get('auth.type') === AuthType.ENTRA) {
      if (
        !/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(
          this.get('auth.entra.issuer'),
        )
      ) {
        throw new Error(
          'ENTRA_ISSUER must be a tenant-specific Entra v2 issuer',
        );
      }
      for (const key of ['audience', 'roles', 'clientIds']) {
        if (
          !this.get(`auth.entra.${key}`)
            .split(',')
            .some((v: string) => v.trim())
        ) {
          throw new Error(`auth.entra.${key} is required in entra mode`);
        }
      }
    }
  }

  private validatePostgresqlConfig(): void {
    const connectionString = this.getPostgresql('url');
    const ssl = this.getPostgresql('ssl');
    const caFile = this.getPostgresql('caFile');

    if (!connectionString) {
      throw new Error('POSTGRES_URL is required for the PostgreSQL job store');
    }

    let url: URL;
    try {
      url = new URL(connectionString);
    } catch {
      throw new Error('POSTGRES_URL must be a valid PostgreSQL URL');
    }
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      throw new Error('POSTGRES_URL must be a valid PostgreSQL URL');
    }
    if (
      [
        'ssl',
        'sslmode',
        'sslcert',
        'sslkey',
        'sslrootcert',
        'sslfactory',
        'sslnegotiation',
      ].some((key) => url.searchParams.has(key))
    ) {
      throw new Error(
        'Configure PostgreSQL TLS with POSTGRES_SSL and POSTGRES_CA_FILE, not URL parameters',
      );
    }
    if (!ssl && caFile) {
      throw new Error('POSTGRES_CA_FILE requires POSTGRES_SSL');
    }
    try {
      decodeURIComponent(url.username);
      decodeURIComponent(url.password);
    } catch {
      throw new Error(
        'POSTGRES_URL must have valid percent-encoding in credentials',
      );
    }
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
