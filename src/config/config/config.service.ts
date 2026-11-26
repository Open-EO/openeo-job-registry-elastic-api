import { Injectable } from '@nestjs/common';
import * as convict from 'convict';
import * as convict_validator from 'convict-format-with-validator';
import {
  AppConfig,
  ElasticsearchConfig,
  DocumentdbConfig,
  schema,
} from '../schema/config.schema';
import * as dotenv from 'dotenv';
import { AuthType } from '../../auth/models/authtypes.enum';
import { documentdbClient } from '../../jobs/stores/documentdb/documentdb-connection';

@Injectable()
export class ConfigService {
  config: convict.Config<AppConfig>;

  constructor() {
    dotenv.config();
    convict.addFormats(convict_validator);
    this.config = convict(schema(process.env.JOB_STORE_TYPE));
    this.config.validate({ allowed: 'strict' });
    this.validateEntraConfig();
    if (this.get('database.jobStore.type') === 'documentdb') {
      this.validateDocumentdbConfig();
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

  private validateDocumentdbConfig(): void {
    const url = this.getDocumentdb('url');
    if (!url) throw new Error('DOCUMENTDB_URL is required');
    if (!this.getDocumentdb('database').trim())
      throw new Error('DOCUMENTDB_DATABASE is required');
    if (!this.getDocumentdb('collection').trim())
      throw new Error('DOCUMENTDB_COLLECTION is required');
    try {
      documentdbClient(url, this.getDocumentdb('tls'));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          error.message.replace('DocumentDB connection URL', 'DOCUMENTDB_URL'),
        );
      }
      throw error;
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

  getDocumentdb<K extends keyof DocumentdbConfig>(
    field: K,
  ): DocumentdbConfig[K] {
    return this.get(`database.jobStore.documentdb.${field}`);
  }
}
