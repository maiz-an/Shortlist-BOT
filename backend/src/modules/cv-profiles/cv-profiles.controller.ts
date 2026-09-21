import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe,
  Patch, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import type { Response } from 'express';
import { CreateCvProfileDto, UpdateCvProfileDto } from './cv-profiles.dto';
import { CvProfilesService, MAX_CV_BYTES, MIME } from './cv-profiles.service';

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CV_BYTES, files: 1 } });

@Controller('cv-profiles')
export class CvProfilesController {
  constructor(private readonly cvs: CvProfilesService) {}

  @Get()
  async list() {
    const rows = await this.cvs.list();
    return Promise.all(rows.map(async (cv) => ({ ...cv, fileExists: !!(await this.cvs.resolveFile(cv)) })));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.cvs.get(id);
  }

  @Post()
  create(@Body() dto: CreateCvProfileDto) {
    return this.cvs.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCvProfileDto) {
    return this.cvs.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.cvs.remove(id);
  }

  @Post(':id/file')
  @UseInterceptors(upload)
  uploadFile(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name: file)');
    return this.cvs.saveFile(id, file);
  }

  @Get(':id/file')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const cv = await this.cvs.get(id);
    const abs = await this.cvs.resolveFile(cv);
    if (!abs) throw new NotFoundException('No CV file stored for this profile');
    res.setHeader('Content-Type', MIME[path.extname(abs)] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(cv.originalFileName ?? path.basename(abs)).replace(/"/g, '')}"`);
    res.sendFile(abs);
  }
}

@Module({ controllers: [CvProfilesController], providers: [CvProfilesService], exports: [CvProfilesService] })
export class CvProfilesModule {}
