import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { ConfigService } from '../../config/config/config.service';
import { Client, Issuer } from 'openid-client';

export const buildBearerClient = async (configService: ConfigService) => {
  const issuer = await Issuer.discover(
    `${configService.get('auth.oidc.issuer')}/.well-known/openid-configuration`,
  );
  const client = new issuer.Client({
    client_id: configService.get('auth.oidc.clientId'),
    client_secret: configService.get('auth.oidc.clientSecret'),
  });
  return client;
};

@Injectable()
export class BearerStrategy extends PassportStrategy(Strategy, 'bearer') {
  client: Client;

  constructor(client: Client, private logger: Logger) {
    super({}, (token, verified) => this.verify(token, verified));
    this.client = client;
  }

  private async verify(token: string, verified: (error, user, info) => void) {
    if (!this.client) {
      verified(`No client available for checking token`, null, null);
    } else {
      try {
        const { active } = await this.client.introspect(token);
        if (active) {
          verified(null, {}, null);
        } else {
          this.logger.warn(`Token is invalid`, BearerStrategy.name);
          verified(null, null, 'token_invalid');
        }
      } catch (e) {
        this.logger.error(
          `An error occurred while verifying token ${token}`,
          e,
          BearerStrategy.name,
        );
      }
    }
  }
}
