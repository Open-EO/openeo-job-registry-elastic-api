import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '../../config/config/config.service';

@Injectable()
export class ReadinessIndicator extends HealthIndicator {
  constructor(
    private readonly client: ElasticsearchService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      await this.client.search(
        { index: this.config.get('database.jobsIdx'), size: 0 },
        {
          requestTimeout: this.config.get('health.es.timeout'),
          maxRetries: 0,
        },
      );
      return this.getStatus('elasticsearch', true);
    } catch {
      this.logger.error('Elasticsearch readiness check failed');
      throw new HealthCheckError('Elasticsearch unavailable', {
        elasticsearch: { status: 'down' },
      });
    }
  }
}
