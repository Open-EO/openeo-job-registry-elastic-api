import { HttpModule, HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AxiosResponse } from 'axios';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { of, throwError } from 'rxjs';
import { ConfigService } from '../../../config/config/config.service';
import { ElasticsearchHealthProbe } from './elasticsearch-health-probe';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { JobsModule } from '../../jobs.module';
import { JobStore } from '../job-store';

describe('Elasticsearch health probe', () => {
  const http = { get: jest.fn() };
  let probe: ElasticsearchHealthProbe;
  const response = (status: string): Partial<AxiosResponse> => ({
    data: { status },
  });

  beforeEach(async () => {
    http.get.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        ElasticsearchHealthProbe,
        { provide: HttpService, useValue: http },
        { provide: ConfigService, useValue: { get: () => 500 } },
      ],
    }).compile();
    probe = module.get(ElasticsearchHealthProbe);
  });

  it.each(['green', 'yellow'])('accepts %s cluster status', async (status) => {
    http.get.mockReturnValue(of(response(status)));
    await expect(probe.check(['http://node'], 'jobs index')).resolves.toEqual({
      name: 'elasticsearch',
      status: 'up',
    });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(
      'http://node/_cluster/health/jobs%20index?pretty',
      { timeout: 500 },
    );
  });

  it('reports red status and network errors as down', async () => {
    http.get.mockImplementation((url: string) => {
      if (url.startsWith('failed')) {
        return throwError(() => new Error('connection failed'));
      }
      return of(response('red'));
    });
    const result = await probe.check(['red', 'failed'], 'jobs');
    expect(result.status).toBe('down');
    expect(result.errors).toEqual([
      expect.stringContaining('red - '),
      expect.stringContaining('failed - connection failed'),
    ]);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('keeps partial outages as warnings', async () => {
    http.get.mockImplementation((url: string) =>
      url.startsWith('failed')
        ? throwError(() => new Error('unavailable'))
        : of(response('green')),
    );
    expect(await probe.check(['healthy', 'failed'], 'jobs')).toEqual({
      name: 'elasticsearch',
      status: 'up',
      warnings: ['failed - unavailable'],
    });
  });

  it('treats a non-success HTTP response as down even with a green body', async () => {
    let calls = 0;
    const server = createServer((_, res) => {
      calls++;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'green' }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const module = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        ElasticsearchHealthProbe,
        { provide: ConfigService, useValue: { get: () => 1000 } },
      ],
    }).compile();
    try {
      const port = (server.address() as AddressInfo).port;
      const actual = module.get(ElasticsearchHealthProbe);
      const result = await actual.check([`http://127.0.0.1:${port}`], 'jobs');
      expect(result.status).toBe('down');
      expect(result.errors).toEqual([expect.stringContaining('503')]);
      expect(calls).toBe(1);
    } finally {
      await module.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('connects the selected Elasticsearch store to its probe and configuration', async () => {
    http.get.mockReturnValue(of(response('yellow')));
    const config = new ConfigService();
    config.config.set(
      'database.jobStore.elasticsearch.hosts',
      ' http://node, http://second ',
    );
    config.config.set(
      'database.jobStore.elasticsearch.jobsIdx',
      'configured-index',
    );
    config.config.set('health.es.timeout', 500);
    const module = await Test.createTestingModule({
      imports: [JobsModule.register('elasticsearch')],
    })
      .overrideProvider(ElasticsearchService)
      .useValue({})
      .overrideProvider(HttpService)
      .useValue(http)
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    await expect(module.get(JobStore).checkHealth()).resolves.toEqual({
      name: 'elasticsearch',
      status: 'up',
    });
    expect(http.get).toHaveBeenCalledWith(
      'http://node/_cluster/health/configured-index?pretty',
      { timeout: 500 },
    );
    expect(http.get).toHaveBeenCalledWith(
      'http://second/_cluster/health/configured-index?pretty',
      { timeout: 500 },
    );
    expect(http.get).toHaveBeenCalledTimes(2);
    await module.close();
  });

  it('checks a real HTTP endpoint and accepts yellow responses', async () => {
    let calls = 0;
    const server = createServer((_, res) => {
      calls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'yellow' }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const module = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        ElasticsearchHealthProbe,
        { provide: ConfigService, useValue: { get: () => 1000 } },
      ],
    }).compile();
    try {
      const port = (server.address() as AddressInfo).port;
      const actual = module.get(ElasticsearchHealthProbe);
      await expect(
        actual.check([`http://127.0.0.1:${port}`], 'jobs'),
      ).resolves.toEqual({ name: 'elasticsearch', status: 'up' });
      expect(calls).toBe(1);
    } finally {
      await module.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
