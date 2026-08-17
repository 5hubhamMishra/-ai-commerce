import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Enforces one error shape across the entire API (see docs/API.md "Error contract").
 * Internal details (stack traces, raw Prisma/driver errors) never reach the client —
 * only a stable machine-readable code, a safe message, and a request ID for support/debugging.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      (request as Request & { requestId?: string }).requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = httpStatusToCode(status);

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = typeof b.message === 'string' ? b.message : message;
        if (Array.isArray(b.message)) {
          // class-validator returns an array of field errors — surface as details, not the message.
          message = 'The request could not be validated.';
          details = { fields: b.message };
        }
        if (typeof b.code === 'string') code = b.code;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception [${requestId}]: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        requestId,
        details: details ?? {},
      },
    });
  }
}

function httpStatusToCode(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}
