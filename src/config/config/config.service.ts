import { Injectable } from '@nestjs/common';
import * as Convict from 'convict';
import { AppConfig, Schema } from '../schema/config.schema';
import * as dotenv from 'dotenv';

@Injectable()
export class ConfigService {
  config: Convict.Config<AppConfig>;

  constructor() {
    dotenv.config();
    this.config = Convict(Schema);
    this.config.validate({ allowed: 'strict' });
  }

  get(configName: string) {
    return this.config.get(configName);
  }
}
