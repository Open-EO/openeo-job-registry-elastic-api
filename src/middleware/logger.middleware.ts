import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Options } from 'pino-http';

export const httpLogOptions: Options = {
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url?.split('?')[0],
    }),
  },
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
  ],
};

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger(`HTTP`);
  use(req: Request, res: Response, next: NextFunction) {
    const startAt = process.hrtime();
    const { ip, method, path } = req;
    const userAgent = req.get('user-agent') || '';
    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const diff = process.hrtime(startAt);
      const responseTime = Math.round(diff[0] * 1e3 + diff[1] * 1e-6);
      this.logger.verbose(
        `${method} ${path} ${statusCode} ${responseTime}ms ${contentLength} - ${userAgent} ${ip}`,
      );
    });
    next();
  }
}
