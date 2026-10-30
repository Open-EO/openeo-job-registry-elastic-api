import { Injectable, Logger } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { ConfigService } from '../../config/config/config.service';

@Injectable()
export class ElasticsearchIndicator extends HealthIndicator {
  constructor(
    private readonly client: ElasticsearchService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      const { body } = await this.client.cluster.health(
        { index: this.configService.get('database.jobsIdx') },
        this.requestOptions(),
      );
      if (!['green', 'yellow'].includes(body.status)) {
        throw new Error('Elasticsearch cluster is not healthy');
      }
      return this.getStatus('elasticsearch', true);
    } catch {
      this.unavailable('Elasticsearch health check failed');
    }
  }

  async isReady(): Promise<HealthIndicatorResult> {
    try {
      // Readiness needs only the configured index's read privilege.
      await this.client.search(
        { index: this.configService.get('database.jobsIdx'), size: 0 },
        this.requestOptions(),
      );
      return this.getStatus('elasticsearch', true);
    } catch {
      this.unavailable('Elasticsearch readiness check failed');
    }
  }

  private requestOptions() {
    return {
      requestTimeout: this.configService.get('health.es.timeout'),
      maxRetries: 0,
    };
  }

  private unavailable(message: string): never {
    // Transport errors can include credentials; do not serialize them.
    this.logger.error(message);
    throw new HealthCheckError('Elasticsearch unavailable', {
      elasticsearch: { status: 'down' },
    });
  }
}
