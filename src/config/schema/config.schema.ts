import * as convict from 'convict';

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
    sessionSecret: {
      doc: 'Secret to sign the session of the API',
      format: '*',
      env: 'SESSION_SECRET',
      default: 'my-secret',
      arg: 'session_secret',
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
};
