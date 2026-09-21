import { Controller, Get } from '@nestjs/common';
import { Public } from './common/guards/api-token.guard';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async getHealth() {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unreachable';
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'job-app-automation-backend',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
