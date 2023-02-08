import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { UtilsModule } from './utils/utils.module';

@Module({
  imports: [ConfigModule, AuthModule, JobsModule, HealthModule, UtilsModule],
})
export class AppModule {}
