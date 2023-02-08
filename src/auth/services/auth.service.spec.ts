import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthType } from '../models/authtypes.enum';
import { BearerGuard } from '../bearer/bearer.guard';
import { ConfigService } from '../../config/config/config.service';
import { ConfigModule } from '../../config/config.module';
import { BaseClient } from 'openid-client';
import { buildBearerClient } from '../bearer/bearer.strategy';

describe('AuthService', () => {
  let service: AuthService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return the correct authentication guard based on the config', async () => {
    // Bearer type
    jest.spyOn(configService, 'get').mockReturnValueOnce(AuthType.BEARER);
    expect(service.getAuthGuard(undefined)).toBeInstanceOf(BearerGuard);

    // All other cases
    try {
      jest.spyOn(configService, 'get').mockReturnValueOnce('foobar');
      service.getAuthGuard(undefined);
    } catch (e) {
      expect(e.message).toEqual('Auth guard of type foobar is not supported!');
    }
  });
});
