import { Logger, Module } from '@nestjs/common';
import { JobsController } from './controllers/jobs/jobs.controller';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config/config.service';
import { DatabaseService } from './services/database/database.service';

@Module({
  controllers: [JobsController],
  imports: [
    ConfigModule,
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        nodes: configService
          .get('database.hosts')
          .split(',')
          .map((h) => h.trim()),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [DatabaseService, Logger],
})
export class JobsModule {}
