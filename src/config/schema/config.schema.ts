import * as convict from 'convict';
import { AuthType } from '../../auth/models/authtypes.enum';

export interface AppConfig {
  port: number;
}

export const schema: convict.Schema<AppConfig> = {
  general: {
    port: {
      doc: 'Port that is used to bind the API',
      format: 'port',
      default: 3000,
      env: 'PORT',
      arg: 'port',
    },
  },
  auth: {
    type: {
      doc: 'Authentication type to use within the API',
      format: Object.values(AuthType),
      default: AuthType.BEARER,
      env: 'AUTH_TYPE',
      arg: 'auth_type',
    },
    oidc: {
      issuer: {
        doc: 'OIDC issuer URL',
        format: 'String',
        env: 'OIDC_ISSUER',
        default: 'https://example.com',
        arg: 'oidc_issuer',
      },
      clientId: {
        doc: 'OpenID Connect Client ID',
        format: '*',
        env: 'OIDC_CLIENT_ID',
        default: 'client_id',
        arg: 'oidc_client_id',
      },
      clientSecret: {
        doc: 'OpenID Connect Client Secret',
        format: '*',
        env: 'OIDC_CLIENT_SECRET',
        default: 'client_secret',
        arg: 'oidc_client_secret',
      },
    },
  },
  database: {
    hosts: {
      doc: 'Comma seperated value list of elasticsearch hosts to use',
      format: '*',
      default: 'http://localhost:9200,http://localhost:9201',
      env: 'DB_HOSTS',
      arg: 'db_hosts',
    },
    jobsIdx: {
      doc: 'Name of the ElasticSearch index that will be used to store the job information',
      format: '*',
      default: 'openeo-jobs-dev',
      env: 'DB_JOBS_IDX',
      arg: 'db_jobs_idx',
    },
  },
};
