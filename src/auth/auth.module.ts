import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '../config/config/config.service';
import { BearerGuard } from './bearer/bearer.guard';
import { BearerStrategy, buildBearerClient } from './bearer/bearer.strategy';
import { AuthType } from './models/authtypes.enum';
import { AuthService } from './auth.service';

const BearerStrategyFactory = {
  provide: 'BearerStrategy',
  useFactory: async (configService: ConfigService, logger: Logger) => {
    const client = await buildBearerClient(configService); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
    const strategy = new BearerStrategy(client, logger);
    return strategy;
  },
  inject: [ConfigService, Logger],
};

@Module({
  imports: [ConfigModule],
  providers: [
    Logger,
    AuthService,
    BearerStrategyFactory,
    {
      provide: APP_GUARD,
      useFactory: (authService: AuthService) => authService.getAuthGuard(),
      inject: [AuthService],
    },
  ],
  exports: [],
})
export class AuthModule {}
