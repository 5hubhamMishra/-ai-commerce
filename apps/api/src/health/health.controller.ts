import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * /health — process is up (liveness). /ready — dependencies (database) are reachable
 * (readiness). Spec: OBSERVABILITY requires both, distinctly.
 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch {
      throw new HttpException(
        { code: 'NOT_READY', message: 'Database is not reachable.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
