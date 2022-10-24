import * as Convict from 'convict';

export interface AppConfig {
  port: number;
}

export const Schema: Convict.Schema<AppConfig> = {
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
    sessionSecret: {
      doc: 'Secret to sign the session of the API',
      format: '*',
      env: 'SESSION_SECRET',
      default: 'my-secret',
      arg: 'session_secret',
    },
    clientId: {
      doc: 'OpenID Connect Client ID',
      format: '*',
      env: 'OIDC_CLIENT_ID',
      arg: 'oidc_client_id',
    },
    clientSecret: {
      doc: 'OpenID Connect Client Secret',
      format: '*',
      env: 'OIDC_CLIENT_SECRET',
      arg: 'oidc_client_secret',
    },
  },
};
