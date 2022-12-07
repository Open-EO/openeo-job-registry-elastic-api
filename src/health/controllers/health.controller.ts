import { Controller, Get, Headers } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../auth/decorators/public.decorator';
import { ConfigService } from '../../config/config/config.service';
import { AuthIndicator } from '../indicators/auth.indicator';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private httpHealthIndicator: HttpHealthIndicator,
    private configService: ConfigService,
    private authIndicator: AuthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  check(@Headers() headers: Headers) {
    const dbCluster = `${
      this.configService.get('database.hosts').split(',')[0]
    }/_cluster/health`;
    return this.health
      .check([
        () =>
          this.httpHealthIndicator.pingCheck('elasticsearch-ping', dbCluster),
        () =>
          this.httpHealthIndicator.responseCheck(
            'elasticsearch-health',
            dbCluster,
            (response) => {
              return response.data['status'] === 'green';
            },
          ),
        () => this.authIndicator.isHealthy(headers),
      ])
      .then((value) => ({
        ...value,
        details: {},
      }));
  }
}
