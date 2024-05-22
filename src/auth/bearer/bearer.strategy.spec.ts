import { BearerStrategy } from './bearer.strategy';
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

    await strategy.verify('token', verified);

    expect(verifyMock).toBeCalledTimes(0);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([
      'No client available for checking token',
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

    await strategy.verify('token', verified);

    expect(verifyMock).toBeCalledTimes(1);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([null, {}, null]);
  });

  it('should not verify token if not active', async () => {
    const strategy = new BearerStrategy(mockClient, new Logger());
    const verified = jest.fn();
    const verifyMock = jest
      .spyOn(mockClient, 'introspect')
      .mockResolvedValueOnce({
        active: false,
      });

    await strategy.verify('token', verified);

    expect(verifyMock).toBeCalledTimes(1);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([null, null, 'token_invalid']);
  });

  it('should not validate the token if an error occurred during the token validation', async () => {
    const strategy = new BearerStrategy(mockClient, new Logger());
    const verified = jest.fn();
    const verifyMock = jest
      .spyOn(mockClient, 'introspect')
      .mockImplementationOnce(() => {
        throw new Error('Nope!');
      });

    await strategy.verify('token', verified);

    expect(verifyMock).toBeCalledTimes(1);
    expect(verified.mock.calls.length).toEqual(1);
    expect(verified.mock.calls[0]).toEqual([
      'An error occurred while verifying the token',
      null,
      null,
    ]);
  });
});
