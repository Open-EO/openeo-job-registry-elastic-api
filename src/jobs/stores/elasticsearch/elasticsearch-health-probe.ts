import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { ConfigService } from '../../../config/config/config.service';
import { JobStoreHealth } from '../job-store';

@Injectable()
export class ElasticsearchHealthProbe {
  private readonly logger = new Logger(ElasticsearchHealthProbe.name);
  private readonly timeout: number;

  constructor(private readonly http: HttpService, config: ConfigService) {
    this.timeout = config.get('health.es.timeout');
  }

  async check(nodes: string[], index: string): Promise<JobStoreHealth> {
    const endpoint = `/_cluster/health/${encodeURIComponent(index)}?pretty`;
    const results = await Promise.all(
      nodes.map(async (node) => {
        try {
          const response = await lastValueFrom(
            this.http.get(`${node}${endpoint}`, {
              timeout: this.timeout,
            }),
          );
          if (!['green', 'yellow'].includes(response.data?.status)) {
            throw new Error(
              'Elasticsearch cluster status is not green or yellow',
            );
          }
          return { node, healthy: true };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Could not perform ping check for host ${node}: ${message}`,
          );
          return { node, healthy: false, message };
        }
      }),
    );
    const errors = results
      .filter((result) => !result.healthy)
      .map((result) => `${result.node} - ${result.message}`);
    return results.some((result) => result.healthy)
      ? {
          name: 'elasticsearch',
          status: 'up',
          ...(errors.length ? { warnings: errors } : {}),
        }
      : { name: 'elasticsearch', status: 'down', errors };
  }
}
