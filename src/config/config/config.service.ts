import { Injectable } from '@nestjs/common';
import * as convict from 'convict';
import * as convict_validator from 'convict-format-with-validator';
import { AppConfig, schema } from '../schema/config.schema';
import * as dotenv from 'dotenv';

@Injectable()
export class ConfigService {
  config: convict.Config<AppConfig>;

  constructor() {
    dotenv.config();
    convict.addFormats(convict_validator);
    this.config = convict(schema);
    this.config.validate({ allowed: 'strict' });
  }

  get(configName: string) {
    return this.config.get(configName);
  }
}
