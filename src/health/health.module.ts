import { DynamicModule, Logger, Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '../config/config.module';
import { AuthIndicator } from './indicators/auth.indicator';
import { AuthModule } from '../auth/auth.module';

@Module({})
export class HealthModule {
  static register(jobsModule: DynamicModule): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      imports: [TerminusModule, ConfigModule, AuthModule, jobsModule],
      providers: [AuthIndicator, Logger],
    };
  }
}
