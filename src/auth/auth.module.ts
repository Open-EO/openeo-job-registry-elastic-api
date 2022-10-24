import { Module } from '@nestjs/common';
import { OIDCStrategy } from './openid/openid.strategy';
import { ConfigModule } from '../config/config.module';
import { APP_GUARD } from '@nestjs/core';
import { OpenIDGuard } from './openid/openid.guard';

@Module({
  imports: [ConfigModule],
  providers: [
    OIDCStrategy,
    {
      provide: APP_GUARD,
      useClass: OpenIDGuard,
    },
  ],
  exports: [OIDCStrategy],
})
export class AuthModule {}
