import { Controller, Get, Headers } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
} from '@nestjs/terminus';
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
        async () => {
          const { name, ...result } = await this.jobStore.checkHealth();
          const health = { [name]: result };
          if (result.status === 'down') {
            throw new HealthCheckError('Job storage is unavailable', health);
          }
          return health;
        },
        () => this.authIndicator.isHealthy(headers),
      ])
      .then((result) => ({
        ...result,
        details: {},
      }));
  }
}
