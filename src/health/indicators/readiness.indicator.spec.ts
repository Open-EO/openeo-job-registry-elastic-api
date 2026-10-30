import { Test } from '@nestjs/testing';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { ConfigService } from '../../config/config/config.service';
import { ReadinessIndicator } from './readiness.indicator';
import { ElasticsearchIndicator } from './elasticsearch.indicator';
import { AuthIndicator } from './auth.indicator';
import { DatabaseService } from '../../jobs/services/database/database.service';
import * as request from 'supertest';

describe('Independent Kubernetes probes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shares the job client and preserves diagnostics without auth or throttling on new probes', async () => {
    const get = ConfigService.prototype.get;
    const configSpy = jest
      .spyOn(ConfigService.prototype, 'get')
      .mockImplementation(function (name) {
        return name === 'throttle.limit' ? 1 : get.call(this, name);
      });
    const client = { search: jest.fn().mockResolvedValue(null) };
    const auth = {
      isHealthy: jest.fn().mockResolvedValue({ auth: { status: 'up' } }),
    };
    const cluster = {
      isHealthy: jest
        .fn()
        .mockResolvedValue({ elasticsearch: { status: 'up' } }),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('BearerStrategy')
      .useValue({})
      .overrideProvider(ElasticsearchService)
      .useValue(client)
      .overrideProvider(AuthIndicator)
      .useValue(auth)
      .overrideProvider(ElasticsearchIndicator)
      .useValue(cluster)
      .compile();
    configSpy.mockRestore();
    const config = module.get(ConfigService);
    const app = module.createNestApplication();
    await app.init();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      expect(module.get(DatabaseService)).toBeDefined();
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .get('/health/live')
          .expect(200)
          .expect({ status: 'ok' });
        expect(client.search).toHaveBeenCalledTimes(i);
        await request(app.getHttpServer()).get('/health/ready').expect(200);
      }
      expect(client.search).toHaveBeenCalledWith(
        { index: config.get('database.jobsIdx'), size: 0 },
        { requestTimeout: config.get('health.es.timeout'), maxRetries: 0 },
      );
      expect(auth.isHealthy).not.toHaveBeenCalled();
      expect(cluster.isHealthy).not.toHaveBeenCalled();
      client.search.mockRejectedValue(new Error('private transport details'));
      const down = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(JSON.stringify(down.body)).not.toContain(
        'private transport details',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'private transport details',
      );
      await request(app.getHttpServer()).get('/health/live').expect(200);
      await request(app.getHttpServer()).get('/health').expect(200);
      expect(cluster.isHealthy).toHaveBeenCalledWith(
        config.get('database.hosts').split(','),
      );
      expect(auth.isHealthy).toHaveBeenCalled();
      expect(module.get(ReadinessIndicator)).toBeDefined();
    } finally {
      log.mockRestore();
      await app.close();
    }
  });
});
