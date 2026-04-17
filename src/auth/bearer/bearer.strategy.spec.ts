import { BearerStrategy, VERIFICATION_ERRORS } from './bearer.strategy';
import { CachingService } from '../../caching/services/cache.service';

describe('BearerStrategy', () => {
  const mockClient: any = {
    introspect: (token: string) => Promise<any>,
  };

  const mockCachingService: jest.Mocked<Pick<CachingService, 'checkCache' | 'store'>> = {
    checkCache: jest.fn(),
    store: jest.fn(),
  };

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should return an error when there is no client defined', async () => {
    mockCachingService.checkCache.mockResolvedValueOnce(undefined);
    mockCachingService.store.mockResolvedValueOnce(undefined);
    const strategy = new BearerStrategy(null, mockCachingService as any);
    const verified = jest.fn();
    const verifyMock = jest
      .spyOn(mockClient, 'introspect')
      .mockResolvedValueOnce({
        active: true,
      });

    await strategy.verify('token', verified, 3);

    expect(verifyMock).toBeCalledTimes(0);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([
      VERIFICATION_ERRORS.NO_CLIENT,
      null,
      null,
    ]);
  });

  it('should verify the token', async () => {
    mockCachingService.checkCache.mockResolvedValueOnce(undefined);
    mockCachingService.store.mockResolvedValueOnce(undefined);
    const strategy = new BearerStrategy(mockClient, mockCachingService as any);
    const verified = jest.fn();
    const verifyMock = jest
      .spyOn(mockClient, 'introspect')
      .mockResolvedValueOnce({
        active: true,
      });

    await strategy.verify('token', verified, 3);

    expect(verifyMock).toBeCalledTimes(1);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([null, {}, null]);
    expect(mockCachingService.store).toBeCalledTimes(1);
  });

  it('should not verify token if not active', async () => {
    mockCachingService.checkCache.mockResolvedValueOnce(undefined);
    const strategy = new BearerStrategy(mockClient, mockCachingService as any);
    const verified = jest.fn();
    const verifyMock = jest.spyOn(mockClient, 'introspect').mockResolvedValue({
      active: false,
    });

    await strategy.verify('token', verified, 3);

    expect(verifyMock).toBeCalledTimes(1);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([
      null,
      null,
      VERIFICATION_ERRORS.TOKEN_INVALID,
    ]);
    expect(mockCachingService.store).toBeCalledTimes(0);
  });

  it('should not validate the token if an error occurred during the token validation', async () => {
    mockCachingService.checkCache.mockResolvedValueOnce(undefined);
    const strategy = new BearerStrategy(mockClient, mockCachingService as any);
    const verified = jest.fn();
    const verifyMock = jest
      .spyOn(mockClient, 'introspect')
      .mockImplementation(() => {
        throw new Error('Nope!');
      });

    await strategy.verify('token', verified, 3);

    expect(verifyMock).toBeCalledTimes(3);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([
      VERIFICATION_ERRORS.GENERAL,
      null,
      null,
    ]);
    expect(mockCachingService.store).toBeCalledTimes(0);
  });

  it('should return cached result and skip introspection on cache hit', async () => {
    const cachedResult = { error: null, user: {}, info: null };
    mockCachingService.checkCache.mockResolvedValueOnce(cachedResult);
    const strategy = new BearerStrategy(mockClient, mockCachingService as any);
    const verified = jest.fn();
    const verifyMock = jest.spyOn(mockClient, 'introspect');

    await strategy.verify('token', verified, 3);

    expect(verifyMock).toBeCalledTimes(0);
    expect(mockCachingService.store).toBeCalledTimes(0);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([null, {}, null]);
  });
});
