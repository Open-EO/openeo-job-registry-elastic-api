import { Strategy } from 'passport-openidconnect';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../../config/config/config.service';

@Injectable()
export class OIDCStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      issuer: 'https://server.example.com',
      authorizationURL: 'https://server.example.com/authorize',
      tokenURL: 'https://server.example.com/token',
      userInfoURL: 'https://server.example.com/userinfo',
      clientID: configService.get('auth.clientId'),
      clientSecret: configService.get('auth.clientSecret'),
      callbackURL: 'https://client.example.org/cb',
    });
  }
}
