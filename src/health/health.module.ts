import { Logger, Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '../config/config.module';
import { HttpModule } from '@nestjs/axios';
import { AuthIndicator } from './indicators/auth.indicator';
import { AuthModule } from '../auth/auth.module';
import { ElasticsearchIndicator } from './indicators/elasticsearch.indicator';
import { JobsModule } from '../jobs/jobs.module';
import { ReadinessIndicator } from './indicators/readiness.indicator';

@Module({
  controllers: [HealthController],
  imports: [HttpModule, TerminusModule, ConfigModule, AuthModule, JobsModule],
  providers: [
    AuthIndicator,
    ElasticsearchIndicator,
    ReadinessIndicator,
    Logger,
  ],
})
export class HealthModule {}
