import { Controller, Get, Headers } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { AuthIndicator } from '../indicators/auth.indicator';
import { JobStore } from '../../jobs/stores/job-store';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private authIndicator: AuthIndicator,
    private jobStore: JobStore,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  async check(@Headers() headers: Headers) {
    return await this.health
      .check([
        () => this.checkJobStore(),
        () => this.authIndicator.isHealthy(headers),
      ])
      .then((result) => ({
        ...result,
        details: {},
      }));
  }

  @Get('live')
  @Public()
  @SkipThrottle()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @Public()
  @SkipThrottle()
  ready() {
    return this.health.check([() => this.checkJobStore()]);
  }

  private async checkJobStore() {
    const { name, ...result } = await this.jobStore.checkHealth();
    const health = { [name]: result };
    if (result.status === 'down') {
      throw new HealthCheckError('Job storage is unavailable', health);
    }
    return health;
  }
}
