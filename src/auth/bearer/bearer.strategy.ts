import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { ConfigService } from '../../config/config/config.service';
import { Client, custom, IntrospectionResponse, Issuer } from 'openid-client';

/* istanbul ignore next */
export const buildBearerClient = async (configService: ConfigService) => {
  const issuer = await Issuer.discover(
    `${configService.get('auth.oidc.issuer')}/.well-known/openid-configuration`,
  );
  const client = new issuer.Client({
    client_id: configService.get('auth.oidc.clientId'),
    client_secret: configService.get('auth.oidc.clientSecret'),
  });
  client[custom.http_options] = (options: any) => ({
    ...options,
    timeout: 5000,
    retry: 2,
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

  public async verify(token: string, verified: (error, user, info) => void) {
    if (!this.client) {
      verified(`No client available for checking token`, null, null);
    } else {
      try {
        const response: IntrospectionResponse = await this.client.introspect(
          token,
        );
        if (response.active) {
          verified(null, {}, null);
        } else {
          this.logger.debug(`Bearer token:`, token, BearerStrategy.name);
          this.logger.debug(
            `Introspection response:`,
            response,
            BearerStrategy.name,
          );
          this.logger.warn(`Token is invalid`, BearerStrategy.name);
          verified(null, null, 'token_invalid');
        }
      } catch (e) {
        this.logger.error(
          `An error occurred while verifying token ${token}: ${e}`,
          BearerStrategy.name,
        );
        verified(`An error occurred while verifying the token`, null, null);
      }
    }
  }
}
