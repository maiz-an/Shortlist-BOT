import { Body, Controller, Delete, Get, HttpCode, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { DatePostedFilter, JobType, RemotePreference } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JobAnalysisModule } from '../job-analysis/job-analysis.module';
import { JobSourcesModule } from '../job-sources/job-sources.module';
import { JobsModule } from '../jobs/jobs.controller';
import { SettingsModule } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { SearchRunner } from './search-runner.service';

const strList = () => [IsArray(), ArrayMaxSize(50), IsString({ each: true }), MaxLength(100, { each: true })];
const apply = (...d: PropertyDecorator[]) => (t: object, k: string | symbol) => d.forEach((f) => f(t, k));

class ProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @apply(...strList()) keywords!: string[];
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) minMatchScore?: number;
  @IsOptional() @apply(...strList()) excludedKeywords?: string[];
  @IsOptional() @IsArray() @IsEnum(JobType, { each: true }) preferredJobTypes?: JobType[];
  @IsOptional() @apply(...strList()) preferredLocations?: string[];
  @IsOptional() @IsEnum(RemotePreference) remotePreference?: RemotePreference;
  @IsOptional() @IsEnum(DatePostedFilter) datePosted?: DatePostedFilter;
  @IsOptional() @IsString() @MaxLength(30) experienceLevel?: string;
  @IsOptional() @IsString() sortBy?: 'recent' | 'relevant';
  @IsOptional() @IsInt() @Min(1) @Max(5) maxPages?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) sourceIds?: string[];
}

class UpdateProfileDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @apply(...strList()) keywords?: string[];
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) minMatchScore?: number;
  @IsOptional() @apply(...strList()) excludedKeywords?: string[];
  @IsOptional() @IsArray() @IsEnum(JobType, { each: true }) preferredJobTypes?: JobType[];
  @IsOptional() @apply(...strList()) preferredLocations?: string[];
  @IsOptional() @IsEnum(RemotePreference) remotePreference?: RemotePreference;
  @IsOptional() @IsEnum(DatePostedFilter) datePosted?: DatePostedFilter;
  @IsOptional() @IsString() @MaxLength(30) experienceLevel?: string;
  @IsOptional() @IsString() sortBy?: 'recent' | 'relevant';
  @IsOptional() @IsInt() @Min(1) @Max(5) maxPages?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) sourceIds?: string[];
}

class RunDto {
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) profileIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sourceKeys?: string[];
}

@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService, private readonly runner: SearchRunner) {}

  @Get('profiles')
  profiles() {
    return this.prisma.jobSearchProfile.findMany({ orderBy: { createdAt: 'asc' }, include: { sources: { select: { id: true, key: true, name: true } } } });
  }

  @Post('profiles')
  create(@Body() { sourceIds, ...dto }: ProfileDto) {
    return this.prisma.jobSearchProfile.create({
      data: { ...dto, ...(sourceIds ? { sources: { connect: sourceIds.map((id) => ({ id })) } } : {}) },
      include: { sources: true },
    });
  }

  @Patch('profiles/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() { sourceIds, ...dto }: UpdateProfileDto) {
    return this.prisma.jobSearchProfile.update({
      where: { id },
      data: { ...dto, ...(sourceIds ? { sources: { set: sourceIds.map((sid) => ({ id: sid })) } } : {}) },
      include: { sources: true },
    });
  }

  @Delete('profiles/:id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.jobSearchProfile.delete({ where: { id } });
  }

  /** "FIND NEW JOBS": runs in the background; poll /search/runs for progress. */
  @Post('run')
  @HttpCode(202)
  run(@Body() dto: RunDto) {
    this.runner.start(dto);
    return { started: true };
  }

  @Get('status')
  status() {
    return { running: this.runner.isRunning() };
  }

  @Get('runs')
  runs() {
    return this.prisma.searchRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20, include: { jobSearchProfile: { select: { name: true } } } });
  }
}

/** Checks once a minute whether the configured interval has elapsed. Never auto-sends applications. */
@Injectable()
export class SearchScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly runner: SearchRunner) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick() {
    try {
      const s = await this.settings.get('scheduler');
      if (!s.enabled || this.runner.isRunning()) return;
      const last = await this.prisma.searchRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true } });
      if (last && Date.now() - last.startedAt.getTime() < s.intervalHours * 3_600_000) return;
      this.logger.log({ event: 'scheduler.run', intervalHours: s.intervalHours });
      this.runner.start({ profileIds: s.profileIds, sourceKeys: s.sourceKeys });
    } catch (err) {
      this.logger.error({ event: 'scheduler.failed', error: (err as Error).message });
    }
  }
}

@Module({
  imports: [JobSourcesModule, JobsModule, JobAnalysisModule, SettingsModule],
  controllers: [SearchController],
  providers: [SearchRunner, SearchScheduler],
})
export class SearchModule {}
