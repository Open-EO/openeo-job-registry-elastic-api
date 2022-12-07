import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '../config/config.module';
import { HttpModule } from '@nestjs/axios';
import { AuthIndicator } from './indicators/auth.indicator';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [HealthController],
  imports: [HttpModule, TerminusModule, ConfigModule, AuthModule],
  providers: [AuthIndicator],
})
export class HealthModule {}
