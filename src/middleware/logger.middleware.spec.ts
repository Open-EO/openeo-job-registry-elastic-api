import { createServer } from 'http';
import { PassThrough } from 'stream';
import pinoHttp from 'pino-http';
import * as request from 'supertest';
import { Logger } from '@nestjs/common';
import { BearerStrategy } from '../auth/bearer/bearer.strategy';
import { CachingService } from '../caching/services/cache.service';
import { httpLogOptions, LoggerMiddleware } from './logger.middleware';
import * as express from 'express';
import { Issuer } from 'openid-client';
import { Test } from '@nestjs/testing';
import { CachingModule } from '../caching/caching.module';

describe('Credential-safe logging', () => {
  afterEach(() => jest.restoreAllMocks());

  it('omits tokens, request cookies and response cookies from HTTP logs', async () => {
    const stream = new PassThrough();
    let output = '';
    stream.on('data', (chunk) => (output += chunk.toString()));
    const logger = pinoHttp(httpLogOptions, stream);
    const server = createServer((req, res) => {
      logger(req, res);
      res.setHeader('set-cookie', 'session=response-secret');
      res.end('ok');
    });
    await request(server)
      .get('/jobs?access_token=query-secret')
      .set('Authorization', 'Bearer header-secret')
      .set('Cookie', 'session=request-secret')
      .expect(200);
    expect(output).toContain('"url":"/jobs"');
    for (const secret of [
      'query-secret',
      'header-secret',
      'request-secret',
      'response-secret',
    ]) {
      expect(output).not.toContain(secret);
    }
    stream.end();
  });

  it('omits query tokens from the secondary HTTP middleware', async () => {
    const verbose = jest
      .spyOn(Logger.prototype, 'verbose')
      .mockImplementation();
    const app = express();
    const middleware = new LoggerMiddleware();
    app.use((req, res, next) => middleware.use(req, res, next));
    app.get('/jobs', (_req, res) => res.send('ok'));
    await request(app).get('/jobs?access_token=query-secret').expect(200);
    expect(verbose).toHaveBeenCalledWith(
      expect.stringContaining('GET /jobs 200'),
    );
    expect(JSON.stringify(verbose.mock.calls)).not.toContain('query-secret');
  });

  it('does not log the token, introspection payload or remote error details', async () => {
    const module = await Test.createTestingModule({
      imports: [CachingModule],
    }).compile();
    try {
      const cache = module.get(CachingService);
      jest.spyOn(cache, 'checkCache').mockResolvedValue(undefined);
      const issuer = new Issuer({ issuer: 'https://example.com' });
      const client = new issuer.Client({ client_id: 'test-client' });
      const introspect = jest.spyOn(client, 'introspect').mockResolvedValue({
        active: false,
        scope: 'introspection-secret',
      });
      const strategy = new BearerStrategy(client, cache);
      const debug = jest.spyOn(strategy.logger, 'debug').mockImplementation();
      const error = jest.spyOn(strategy.logger, 'error').mockImplementation();
      await strategy.verify('access-token-secret', jest.fn(), 1);
      introspect.mockRejectedValue(new Error('remote-secret'));
      await strategy.introspectToken('access-token-secret');
      const output = JSON.stringify([debug.mock.calls, error.mock.calls]);
      for (const secret of [
        'access-token-secret',
        'introspection-secret',
        'remote-secret',
      ]) {
        expect(output).not.toContain(secret);
      }
      expect(error).toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
});
