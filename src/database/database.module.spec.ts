import { Test } from '@nestjs/testing';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '../config/config/config.service';
import { buildDatabaseOptions, DatabaseModule } from './database.module';
import { JobsModule } from '../jobs/jobs.module';
import { ElasticsearchIndicator } from '../health/indicators/elasticsearch.indicator';
import { HealthController } from '../health/controllers/health.controller';
import { AuthIndicator } from '../health/indicators/auth.indicator';
import { Logger } from '@nestjs/common';
import { HealthCheckError, TerminusModule } from '@nestjs/terminus';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { BearerGuard } from '../auth/bearer/bearer.guard';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';

describe('Elasticsearch connection options', () => {
  const config = (values: Record<string, string>) => {
    const service = new ConfigService();
    jest.spyOn(service, 'get').mockImplementation((name) => values[name] || '');
    return service;
  };
  afterEach(() => jest.restoreAllMocks());

  it('preserves existing connection defaults without opting into API keys', () => {
    const values = {
      'database.hosts': 'http://localhost:9200, http://localhost:9201',
    };
    expect(buildDatabaseOptions(config(values))).toEqual({
      nodes: ['http://localhost:9200', 'http://localhost:9201'],
    });
  });

  it('sets encoded API-key authentication without disabling TLS verification', () => {
    expect(
      buildDatabaseOptions(
        config({
          'database.hosts': 'https://one.example:9243,https://two.example:9243',
          'database.apiKey': 'encoded-test-key',
        }),
      ),
    ).toEqual({
      nodes: ['https://one.example:9243', 'https://two.example:9243'],
      auth: { apiKey: 'encoded-test-key' },
    });
  });

  it.each([
    'http://localhost:9200',
    'https://one.example,http://localhost:9200',
    'https://user:password@one.example',
    'not-a-url',
  ])(
    'rejects unsafe API-key endpoints without echoing credentials (%s)',
    (hosts) => {
      expect(() =>
        buildDatabaseOptions(
          config({
            'database.hosts': hosts,
            'database.apiKey': 'encoded-test-key',
          }),
        ),
      ).toThrow(/DB_HOSTS|DB_API_KEY/);
    },
  );

  it('reads mounted CA files, keeps verification enabled and fails on missing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ejr-ca-'));
    const path = join(dir, 'ca.pem');
    try {
      writeFileSync(path, 'test CA contents');
      expect(
        buildDatabaseOptions(
          config({
            'database.hosts': 'https://one.example',
            'database.caFile': path,
          }),
        ).ssl,
      ).toEqual({ ca: readFileSync(path), rejectUnauthorized: true });
    } finally {
      unlinkSync(path);
      rmdirSync(dir);
    }
    expect(() =>
      buildDatabaseOptions(
        config({
          'database.hosts': 'https://one.example',
          'database.caFile': path,
        }),
      ),
    ).toThrow();
  });

  it('shares the same configured Elasticsearch provider with job consumers', async () => {
    const module = await Test.createTestingModule({
      imports: [JobsModule, DatabaseModule],
    }).compile();
    try {
      expect(module.select(JobsModule).get(ElasticsearchService)).toBe(
        module.select(DatabaseModule).get(ElasticsearchService),
      );
    } finally {
      await module.close();
    }
  });
});

describe('Authenticated Elasticsearch probes', () => {
  const config = new ConfigService();
  const client = { search: jest.fn(), cluster: { health: jest.fn() } };
  const logger = new Logger('probe-test');
  let indicator: ElasticsearchIndicator;

  beforeEach(async () => {
    jest
      .spyOn(config, 'get')
      .mockImplementation((name) =>
        name === 'database.jobsIdx' ? 'configured-index' : 750,
      );
    const module = await Test.createTestingModule({
      providers: [
        ElasticsearchIndicator,
        { provide: ElasticsearchService, useValue: client },
        { provide: ConfigService, useValue: config },
        { provide: Logger, useValue: logger },
      ],
    }).compile();
    indicator = module.get(ElasticsearchIndicator);
  });
  afterEach(() => jest.restoreAllMocks());
  afterEach(() => jest.resetAllMocks());

  it('uses a bounded index read without cluster privileges for readiness', async () => {
    const search = client.search.mockResolvedValue(null);
    expect(await indicator.isReady()).toEqual({
      elasticsearch: { status: 'up' },
    });
    expect(search).toHaveBeenCalledWith(
      { index: 'configured-index', size: 0 },
      { requestTimeout: 750, maxRetries: 0 },
    );
  });

  it.each(['green', 'yellow', 'red'])(
    'preserves cluster-health diagnostic policy (%s)',
    async (status) => {
      client.cluster.health.mockResolvedValue({
        body: { status },
        statusCode: 200,
        headers: {},
        warnings: [],
        meta: {
          context: null,
          name: 'test',
          request: { params: { method: 'GET', path: '/' }, options: {}, id: 1 },
          connection: null,
          attempts: 0,
          aborted: false,
        },
      });
      if (status === 'red') {
        await expect(indicator.isHealthy()).rejects.toBeInstanceOf(
          HealthCheckError,
        );
      } else {
        expect(await indicator.isHealthy()).toEqual({
          elasticsearch: { status: 'up' },
        });
      }
      expect(client.cluster.health).toHaveBeenCalledWith(
        { index: 'configured-index' },
        { requestTimeout: 750, maxRetries: 0 },
      );
    },
  );

  it('does not disclose transport credentials when probes fail', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation();
    client.search.mockRejectedValue(new Error('ApiKey secret'));
    client.cluster.health.mockRejectedValue(new Error('ApiKey secret'));
    await expect(indicator.isReady()).rejects.toThrow(
      'Elasticsearch unavailable',
    );
    await expect(indicator.isHealthy()).rejects.toThrow(
      'Elasticsearch unavailable',
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret');
  });

  it('keeps new probes unauthenticated and unthrottled, and live during database failure', async () => {
    client.search.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      imports: [
        TerminusModule,
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 1 }]),
      ],
      controllers: [HealthController],
      providers: [
        { provide: ElasticsearchIndicator, useValue: indicator },
        { provide: AuthIndicator, useValue: { isHealthy: jest.fn() } },
        {
          provide: APP_GUARD,
          useFactory: (reflector: Reflector) => new BearerGuard(reflector),
          inject: [Reflector],
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/health/ready').expect(200);
        await request(app.getHttpServer())
          .get('/health/live')
          .expect(200)
          .expect({ status: 'ok' });
      }
      client.search.mockRejectedValue(new Error('database down'));
      await request(app.getHttpServer()).get('/health/ready').expect(503);
      await request(app.getHttpServer()).get('/health/live').expect(200);
    } finally {
      await app.close();
    }
  });
});
