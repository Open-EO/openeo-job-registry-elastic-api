import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { UtilsModule } from './utils/utils.module';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { ConfigService } from './config/config/config.service';
import { LoggerModule } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    JobsModule,
    HealthModule,
    UtilsModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          level: config.get('general.loglevel'),
          pinoHttp: {
            level: config.get('general.loglevel'),
            genReqId: (request) =>
              request.headers['x-correlation-id'] || uuidv4(),
            transport: config.get('general.pretty')
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: false,
                    messageFormat: `{req.id} - {req.method} {req.url} {res.statusCode} - {if context}({context}){end} {msg}{message}`,
                    hideObject: true,
                    translateTime: 'SYS:standard',
                  },
                }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): any {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
