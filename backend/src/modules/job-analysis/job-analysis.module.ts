import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsModule } from '../applications/applications.controller';
import { JobsModule } from '../jobs/jobs.controller';
import { JobsService } from '../jobs/jobs.service';
import { SettingsModule } from '../settings/settings.controller';
import { AnalysisQueue } from './analysis-queue.service';
import { AnalysisService } from './analysis.service';

class ManualJobDto {
  @IsString() @IsNotEmpty() @MaxLength(200) company!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(1000) jobUrl?: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) description!: string;
  @IsOptional() @IsEmail() applicationEmail?: string;
}

@Controller()
export class JobAnalysisController {
  constructor(
    private readonly jobs: JobsService,
    private readonly queue: AnalysisQueue,
    private readonly analysis: AnalysisService,
    private readonly prisma: PrismaService,
  ) {}

  /** Manual paste goes through exactly the same ingest -> analyze -> score pipeline as collected jobs. */
  @Post('jobs/manual')
  async manual(@Body() dto: ManualJobDto) {
    const res = await this.jobs.ingest(
      {
        sourceKey: 'manual', title: dto.title, company: dto.company, location: dto.location, description: dto.description,
        url: dto.jobUrl, applicationEmail: dto.applicationEmail,
      },
      { isManual: true },
    );
    if (!res) return { error: 'Invalid job' };
    if (res.created) this.queue.enqueue(res.jobId);
    return res;
  }

  @Post('jobs/analyze-pending')
  @HttpCode(202)
  async analyzePending() {
    const jobs = await this.prisma.job.findMany({ where: { status: 'NEW' }, select: { id: true }, take: 500 });
    this.queue.enqueue(jobs.map((j) => j.id));
    return { queued: jobs.length };
  }

  @Post('jobs/:id/analyze')
  @HttpCode(202)
  async reanalyze(@Param('id', ParseUUIDPipe) id: string) {
    await this.jobs.get(id);
    this.queue.enqueue(id);
    return { queued: true };
  }

  @Get('analysis/queue')
  status() {
    return this.queue.status();
  }
}

@Module({
  imports: [JobsModule, ApplicationsModule, SettingsModule],
  controllers: [JobAnalysisController],
  providers: [AnalysisService, AnalysisQueue],
  exports: [AnalysisQueue, AnalysisService],
})
export class JobAnalysisModule {}
