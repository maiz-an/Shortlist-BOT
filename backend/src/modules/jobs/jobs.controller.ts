import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JobsService } from './jobs.service';

class JobListDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) minScore?: number;
  @IsOptional() @IsIn(['APPLY', 'MAYBE', 'SKIP']) recommendation?: string;
  @IsOptional() @IsString() @MaxLength(50) sourceKey?: string;
  @IsOptional() @IsIn(['createdAt', 'postedAt', 'matchScore']) sort?: 'createdAt' | 'postedAt' | 'matchScore';
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@Query() q: JobListDto) {
    return this.jobs.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.jobs.remove(id);
  }
}

@Module({ controllers: [JobsController], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
