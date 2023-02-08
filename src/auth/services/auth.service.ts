import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config/config.service';
import { AuthType } from '../models/authtypes.enum';
import { BearerGuard } from '../bearer/bearer.guard';
import { Reflector } from '@nestjs/core';
import { BaseClient } from 'openid-client';

@Injectable()
export class AuthService {
  private client: BaseClient;

  constructor(private configService: ConfigService) {}

  public getAuthGuard(reflector: Reflector) {
    const type = this.configService.get('auth.type');
    switch (type) {
      case AuthType.BEARER:
        return new BearerGuard(reflector);
      default:
        throw new Error(`Auth guard of type ${type} is not supported!`);
    }
  }

  /* istanbul ignore next */
  public setAuthClient(client: BaseClient) {
    this.client = client;
  }

  /* istanbul ignore next */
  public getAuthClient(): BaseClient {
    return this.client;
  }
}
