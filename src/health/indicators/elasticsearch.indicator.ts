import { Injectable, Logger } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';

@Injectable()
export class ElasticsearchIndicator extends HealthIndicator {
  constructor(
    private httpHealthIndicator: HttpHealthIndicator,
    private logger: Logger,
  ) {
    super();
  }

  private async isESNodeHealthy(
    node: string,
  ): Promise<{ node: string; healthy: boolean; message?: string }> {
    try {
      let checkResult = await this.httpHealthIndicator.pingCheck(
        node,
        `${node}/_cluster/health`,
        {
          timeout: 1000,
        },
      );
      if (checkResult[node].status === 'down') {
        throw Error(`Could not execute ping to ${node}`);
      }

      checkResult = await this.httpHealthIndicator.responseCheck(
        node,
        `${node}/_cluster/health`,
        (response) => {
          return response.data && response.data['status'] === 'green';
        },
        {
          timeout: 1000,
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

    return this.getStatus('elasticsearch', isAnyHealthy, {
      error: !isAnyHealthy ? messages : undefined,
      warnings: isAnyHealthy && messages.length > 0 ? messages : undefined,
    });
  }
}
