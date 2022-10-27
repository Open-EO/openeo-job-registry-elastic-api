import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config/config.service';
import { AuthType } from './models/authtypes.enum';
import { BearerGuard } from './bearer/bearer.guard';
import { Reflector } from '@nestjs/core';

@Injectable()
export class AuthService {
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
}
