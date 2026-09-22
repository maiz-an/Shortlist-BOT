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

/** The extracted CV text and the send-PDF's internal file name stay on the server. */
function publicCv<T extends { textContent: string | null; sendPdfPath: string | null }>(cv: T) {
  const { textContent, sendPdfPath, ...rest } = cv;
  return { ...rest, textReadable: !!textContent };
}

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CV_BYTES, files: 1 } });

@Controller('cv-profiles')
export class CvProfilesController {
  constructor(private readonly cvs: CvProfilesService) {}

  @Get()
  async list() {
    const rows = await this.cvs.list();
    return Promise.all(rows.map(async (cv) => ({
      ...publicCv(cv), fileExists: !!(await this.cvs.resolveFile(cv)), sendPdfReady: !!(await this.cvs.resolveAttachment(cv)),
    })));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return publicCv(await this.cvs.get(id));
  }

  @Post()
  async create(@Body() dto: CreateCvProfileDto) {
    return publicCv(await this.cvs.create(dto));
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCvProfileDto) {
    return publicCv(await this.cvs.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.cvs.remove(id);
  }

  /** The CV file used for analysis (scoring, emails). PDF or DOCX - whichever reads better for you. */
  @Post(':id/file')
  @UseInterceptors(upload)
  async uploadFile(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name: file)');
    return publicCv(await this.cvs.saveFile(id, file));
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

  /** The PDF you upload yourself, attached to application emails instead of the analysis file. */
  @Post(':id/send-pdf')
  @UseInterceptors(upload)
  async uploadSendPdf(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name: file)');
    return publicCv(await this.cvs.saveSendPdf(id, file));
  }

  /** The exact PDF that would be attached to an application email - shown inline (never downloaded). */
  @Get(':id/email-preview')
  async emailPreview(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const cv = await this.cvs.get(id);
    const abs = await this.cvs.resolveAttachment(cv);
    if (!abs) throw new NotFoundException('No PDF has been uploaded for sending yet. Upload one on the CVs page.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(abs);
  }
}

@Module({ controllers: [CvProfilesController], providers: [CvProfilesService], exports: [CvProfilesService] })
export class CvProfilesModule {}
