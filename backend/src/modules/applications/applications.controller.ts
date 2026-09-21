import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { sanitizeNote } from './sanitize-note';
import { ApplicationsService } from './applications.service';

class ListDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class StatusDto {
  @IsEnum(JobStatus) status!: JobStatus;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class UpdateDto {
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Date) @IsDate() followUpDate?: Date | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Date) @IsDate() interviewDate?: Date | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() selectedCvId?: string | null;
}

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get()
  list(@Query() q: ListDto) {
    return this.apps.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.apps.get(id);
  }

  /** Creates (or returns) the application for a job - used by "Review application" / "Reject" on the job page. */
  @Post('from-job/:jobId')
  fromJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.apps.ensureForJob(jobId);
  }

  @Post('by-job/:jobId/status')
  jobStatus(@Param('jobId', ParseUUIDPipe) jobId: string, @Body() dto: StatusDto) {
    return this.apps.setStatus(jobId, dto.status, { note: dto.note && sanitizeNote(dto.note), manual: true });
  }

  @Post(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    return this.apps.setStatusByApplication(id, dto.status, dto.note && sanitizeNote(dto.note));
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDto) {
    return this.apps.update(id, { ...dto, ...(dto.notes !== undefined ? { notes: sanitizeNote(dto.notes) } : {}) });
  }
}

@Module({ controllers: [ApplicationsController], providers: [ApplicationsService], exports: [ApplicationsService] })
export class ApplicationsModule {}
