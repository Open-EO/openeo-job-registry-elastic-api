import { BearerStrategy, VERIFICATION_ERRORS } from './bearer.strategy';
import { Logger } from '@nestjs/common';

describe('BearerStrategy', () => {
  const mockClient: any = {
    introspect: (token: string) => Promise<any>,
  };

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should return an error when there is no client defined', async () => {
    const strategy = new BearerStrategy(null, new Logger());
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
    const strategy = new BearerStrategy(mockClient, new Logger());
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
  });

  it('should not verify token if not active', async () => {
    const strategy = new BearerStrategy(mockClient, new Logger());
    const verified = jest.fn();
    const verifyMock = jest.spyOn(mockClient, 'introspect').mockResolvedValue({
      active: false,
    });

    await strategy.verify('token', verified, 3);

    expect(verifyMock).toBeCalledTimes(3);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([
      null,
      null,
      VERIFICATION_ERRORS.TOKEN_INVALID,
    ]);
  });

  it('should not validate the token if an error occurred during the token validation', async () => {
    const strategy = new BearerStrategy(mockClient, new Logger());
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
  });
});
