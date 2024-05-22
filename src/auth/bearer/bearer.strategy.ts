import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { ConfigService } from '../../config/config/config.service';
import { Client, custom, IntrospectionResponse, Issuer } from 'openid-client';

export enum VERIFICATION_ERRORS {
  NO_CLIENT = 'no_client',
  TOKEN_INVALID = 'token_invalid',
  GENERAL = 'token_validation_error',
}

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
    super({}, (token, verified) => this.verify(token, verified, 3));
    this.client = client;
  }
  public async verify(
    token: string,
    verified: (error, user, info) => void,
    attempts: number,
  ) {
    let attempt = 1;
    let introspectResult;

    while (attempt <= attempts) {
      introspectResult = await this.introspectToken(token);
      if (introspectResult.user) {
        break;
      }
      attempt += 1;
    }

    verified(
      introspectResult.error,
      introspectResult.user,
      introspectResult.info,
    );
  }

  public async introspectToken(
    token: string,
  ): Promise<{ error?: VERIFICATION_ERRORS; user?: any; info?: string }> {
    if (!this.client) {
      return {
        error: VERIFICATION_ERRORS.NO_CLIENT,
        user: null,
        info: null,
      };
    } else {
      try {
        const response: IntrospectionResponse = await this.client.introspect(
          token,
        );
        if (response.active) {
          return {
            error: null,
            user: {},
            info: null,
          };
        } else {
          this.logger.debug(`Bearer token:`, token, BearerStrategy.name);
          this.logger.debug(
            `Introspection response:`,
            response,
            BearerStrategy.name,
          );
          this.logger.warn(`Token is invalid`, BearerStrategy.name);
          // We pass it through info to indicate that the token is invalid and trigger a fail vs an error.
          // See strategy.js for more information on the implementation
          return {
            error: null,
            user: null,
            info: VERIFICATION_ERRORS.TOKEN_INVALID,
          };
        }
      } catch (e) {
        this.logger.error(
          `An error occurred while verifying token ${token}: ${e}`,
          BearerStrategy.name,
        );
        return {
          error: VERIFICATION_ERRORS.GENERAL,
          user: null,
          info: null,
        };
      }
    }
  }
}
