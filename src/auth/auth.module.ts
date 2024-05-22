import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '../config/config/config.service';
import { BearerStrategy, buildBearerClient } from './bearer/bearer.strategy';
import { AuthService } from './services/auth.service';

const BearerStrategyFactory = {
  provide: 'BearerStrategy',
  useFactory: async (
    configService: ConfigService,
    authService: AuthService,
  ) => {
    const client = await buildBearerClient(configService); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
    const strategy = new BearerStrategy(client);
    authService.setAuthClient(client);
    return strategy;
  },
  inject: [ConfigService, AuthService],
};

@Module({
  imports: [ConfigModule],
  providers: [
    Logger,
    AuthService,
    BearerStrategyFactory,
    {
      provide: APP_GUARD,
      useFactory: (authService: AuthService, reflector: Reflector) =>
        authService.getAuthGuard(reflector),
      inject: [AuthService, Reflector],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
