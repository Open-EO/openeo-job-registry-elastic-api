import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OpenIDGuard extends AuthGuard('openidconnect') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
