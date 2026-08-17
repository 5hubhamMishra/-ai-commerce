import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Stamps every request with a correlation ID — echoed in error responses and structured
 * logs so a customer-reported issue can be traced end to end (spec: OBSERVABILITY).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: Request & { requestId?: string },
    res: Response,
    next: NextFunction,
  ) {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && incoming.length <= 100 ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
