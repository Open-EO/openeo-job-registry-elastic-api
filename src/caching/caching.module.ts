import { Module } from '@nestjs/common';
import { CachingService } from './services/cache.service';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config/config.service';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        ttl: configService.get('cache.ttl'),
        max: configService.get('cache.max'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [CachingService],
  exports: [CachingService],
})
export class CachingModule {}
