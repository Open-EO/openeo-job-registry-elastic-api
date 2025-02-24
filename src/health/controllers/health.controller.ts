import { Controller, Get, Headers } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../../auth/decorators/public.decorator';
import { ConfigService } from '../../config/config/config.service';
import { AuthIndicator } from '../indicators/auth.indicator';
import { ElasticsearchIndicator } from '../indicators/elasticsearch.indicator';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private configService: ConfigService,
    private authIndicator: AuthIndicator,
    private elasticSearchIndicator: ElasticsearchIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  async check(@Headers() headers: Headers) {
    const requiredChecks = ['elasticsearch'];
    const result = await this.health.check([
      () =>
        this.elasticSearchIndicator.isHealthy(
          this.configService.get('database.hosts').split(','),
        ),
      () => this.authIndicator.isHealthy(headers),
    ]);

    for (const check of requiredChecks) {
      if (result.info[check] && result.info[check].status === 'down') {
        result.error[check] = result.info[check];
        delete result.info[check];
      }
    }

    return {
      ...result,
      status: Object.keys(result.error || {}).length > 0 ? 'error' : 'ok',
      details: {},
    };
  }
}
