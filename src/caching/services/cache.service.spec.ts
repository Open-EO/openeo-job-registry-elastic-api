import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CachingService } from './cache.service';

describe('CacheService', () => {
  let service: CachingService;
  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CachingService,
        Logger,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<CachingService>(CachingService);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should save the result to the cache', async () => {
    await service.store('foo', 'bar');
    expect(mockCacheManager.set).toBeCalledTimes(1);
  });

  it('should not throw an error whenever something went wrong while saving the result to the cache', async () => {
    jest.spyOn(mockCacheManager, 'set').mockImplementationOnce(() => {
      throw Error('No way!');
    });
    await service.store('foo', 'bar');
    expect(mockCacheManager.set).toBeCalledTimes(1);
  });

  it('should check the result to the cache', async () => {
    jest.spyOn(mockCacheManager, 'get').mockResolvedValue('bar');
    expect(await service.checkCache('foo')).toEqual('bar');
    expect(mockCacheManager.get).toBeCalledTimes(1);
  });

  it('should return undefined whenever an error occurred during cache lookup', async () => {
    jest.spyOn(mockCacheManager, 'get').mockImplementationOnce(() => {
      throw Error('No way!');
    });
    expect(await service.checkCache('foo')).toEqual(undefined);
    expect(mockCacheManager.get).toBeCalledTimes(1);
  });
});
