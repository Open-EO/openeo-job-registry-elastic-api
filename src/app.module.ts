import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { UtilsModule } from './utils/utils.module';
import { LoggerMiddleware } from './middleware/logger.middleware';

@Module({
  imports: [ConfigModule, AuthModule, JobsModule, HealthModule, UtilsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
