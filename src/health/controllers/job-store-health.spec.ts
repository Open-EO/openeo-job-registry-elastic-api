import { HealthCheckError, HealthCheckService } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { JobStore } from '../../jobs/stores/job-store';
import { AuthIndicator } from '../indicators/auth.indicator';
import { HealthController } from './health.controller';

describe('Job store health check', () => {
  it.each(['postgresql', 'elasticsearch', 'other'])(
    'reports health for the %s store without implementation-specific logic',
    async (name) => {
      const store = {
        checkHealth: jest.fn().mockResolvedValue({
          name,
          status: 'up',
          warnings: ['one node unavailable'],
        }),
      };
      const auth = {
        isHealthy: jest.fn().mockResolvedValue({ auth: { status: 'up' } }),
      };
      const health = {
        check: jest.fn(async (indicators) => ({
          details: Object.assign(
            {},
            ...(await Promise.all(indicators.map((indicator) => indicator()))),
          ),
        })),
      };
      const module = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          { provide: JobStore, useValue: store },
          { provide: AuthIndicator, useValue: auth },
          { provide: HealthCheckService, useValue: health },
        ],
      }).compile();
      const controller = module.get(HealthController);
      await controller.check({} as Headers);
      expect(store.checkHealth).toHaveBeenCalledTimes(1);
      expect(auth.isHealthy).toHaveBeenCalledTimes(1);
      const checkStore = health.check.mock.calls[0][0][0];
      await expect(checkStore()).resolves.toEqual({
        [name]: { status: 'up', warnings: ['one node unavailable'] },
      });
      store.checkHealth.mockResolvedValue({
        name,
        status: 'down',
        errors: ['unavailable'],
      });
      await expect(checkStore()).rejects.toMatchObject({
        causes: { [name]: { status: 'down', errors: ['unavailable'] } },
      });
      await expect(controller.check({} as Headers)).rejects.toBeInstanceOf(
        HealthCheckError,
      );
      await module.close();
    },
  );
});
