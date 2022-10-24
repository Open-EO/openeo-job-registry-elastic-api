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
};
