import { Injectable, Logger } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '../../config/config/config.service';

@Injectable()
export class ElasticsearchIndicator extends HealthIndicator {
  private TIMEOUT: number;
  private readonly HEALTH_ENDPOINT = '/cluster/health/marketplace*?pretty';

  constructor(
    private httpHealthIndicator: HttpHealthIndicator,
    private configService: ConfigService,
    private logger: Logger,
  ) {
    super();
    this.TIMEOUT = this.configService.get('health.es.timeout');
  }

  private async isESNodeHealthy(
    node: string,
  ): Promise<{ node: string; healthy: boolean; message?: string }> {
    try {
      let checkResult = await this.httpHealthIndicator.pingCheck(
        node,
        `${node}${this.HEALTH_ENDPOINT}`,
        {
          timeout: this.TIMEOUT,
        },
      );
      if (checkResult[node].status === 'down') {
        throw Error(`Could not execute ping to ${node}`);
      }

      checkResult = await this.httpHealthIndicator.responseCheck(
        node,
        `${node}${this.HEALTH_ENDPOINT}`,
        (response) => {
          return (
            response.data &&
            ['green', 'yellow'].includes(response.data['status'])
          );
        },
        {
          timeout: this.TIMEOUT,
        },
      );
      if (checkResult[node].status === 'down') {
        throw Error(`Could not execute ping to ${node}`);
      }
      return {
        node,
        healthy: true,
      };
    } catch (e) {
      this.logger.error(`Could not perform ping check for host ${node}: ${e}`);
      return {
        healthy: false,
        node,
        message: e.toString(),
      };
    }
  }

  async isHealthy(nodes: string[]): Promise<HealthIndicatorResult> {
    const results = await Promise.all(
      nodes.map((node) => this.isESNodeHealthy(node)),
    );

    const isAnyHealthy = results.some((r) => r.healthy);
    const messages = results
      .filter((r) => !!r.message)
      .map((r) => `${r.node} - ${r.message}`);

    if (!isAnyHealthy) {
      throw new HealthCheckError('All elasticsearch nodes are down', {
        elasticsearch: {
          errors: messages,
        },
      });
    }

    return this.getStatus('elasticsearch', isAnyHealthy, {
      warnings: messages.length > 0 ? messages : undefined,
    });
  }
}
