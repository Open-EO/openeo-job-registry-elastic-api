import { Injectable } from '@nestjs/common';
import * as Convict from 'convict';
import {AppConfig, Schema} from "../schema/config.schema";
import * as dotenv from 'dotenv';

@Injectable()
export class ConfigService {
    config: Convict.Config<AppConfig>;

    constructor() {
        this.config = Convict(Schema);
        const dotEnvFile = dotenv.config().parsed;
        if (dotEnvFile) {
            this.config.load(dotenv.config().parsed);
        }
        this.config.validate({ allowed: 'strict' });
    }

    get(configName: string) {
        return this.config.get(configName);
    }
}
