import { Body, Controller, Get, Inject, Injectable, Module, OnModuleInit, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JOB_SOURCES, JobSource } from './job-source.interface';
import { LinkedInSource } from './linkedin.source';

@Injectable()
export class JobSourceRegistry implements OnModuleInit {
  constructor(@Inject(JOB_SOURCES) private readonly sources: JobSource[], private readonly prisma: PrismaService) {}

  /** Makes sure each implemented source has a DB row so it can be enabled/configured from the UI. */
  async onModuleInit() {
    for (const s of this.sources) {
      await this.prisma.jobSource
        .upsert({ where: { key: s.key }, update: {}, create: { key: s.key, name: s.name, enabled: true, rateLimitMs: 3000 } })
        .catch(() => undefined);
    }
  }

  get(key: string): JobSource | undefined {
    return this.sources.find((s) => s.key === key);
  }

  implementedKeys(): string[] {
    return this.sources.map((s) => s.key);
  }
}

class UpdateSourceDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1000) @Max(60000) rateLimitMs?: number;
}

@Controller('sources')
export class JobSourcesController {
  constructor(private readonly prisma: PrismaService, private readonly registry: JobSourceRegistry) {}

  @Get()
  async list() {
    const rows = await this.prisma.jobSource.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { listings: true } } } });
    const impl = new Set(this.registry.implementedKeys());
    return rows.map((r) => ({ ...r, implemented: impl.has(r.key), listingCount: r._count.listings }));
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSourceDto) {
    return this.prisma.jobSource.update({ where: { id }, data: dto });
  }
}

@Module({
  controllers: [JobSourcesController],
  providers: [
    LinkedInSource,
    { provide: JOB_SOURCES, useFactory: (li: LinkedInSource) => [li] as JobSource[], inject: [LinkedInSource] },
    JobSourceRegistry,
  ],
  exports: [JobSourceRegistry],
})
export class JobSourcesModule {}
