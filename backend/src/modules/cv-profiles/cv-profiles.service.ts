import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCvProfileDto, UpdateCvProfileDto } from './cv-profiles.dto';
import { cvFacts, extractCvText } from './cv-text';

export const MAX_CV_BYTES = 5 * 1024 * 1024;
// Old .doc (Word 97-2003) files are not accepted: nothing in this app can read their text, so
// scoring and emails could not see anything on them.
const ALLOWED: Record<string, (b: Buffer) => boolean> = {
  '.pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  '.docx': (b) => b[0] === 0x50 && b[1] === 0x4b, // zip container
};
export const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function validateCvUpload(originalName: string, buffer: Buffer): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED[ext]) throw new BadRequestException('Only PDF and DOCX files are allowed (an older .doc file can\'t be read - please save it as .docx or export it as a PDF)');
  if (buffer.length > MAX_CV_BYTES) throw new BadRequestException('File too large (max 5 MB)');
  if (!ALLOWED[ext](buffer)) throw new BadRequestException('File content does not match its extension');
  return ext;
}

/** The PDF you upload for sending must actually be a PDF - no auto-generation, so this is stricter. */
export function validateSendPdfUpload(originalName: string, buffer: Buffer): void {
  if (path.extname(originalName).toLowerCase() !== '.pdf') throw new BadRequestException('The file for sending must be a PDF');
  if (buffer.length > MAX_CV_BYTES) throw new BadRequestException('File too large (max 5 MB)');
  if (!ALLOWED['.pdf'](buffer)) throw new BadRequestException('File content does not match its extension');
}

@Injectable()
export class CvProfilesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CvProfilesService.name);
  private readonly dir: string;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    this.dir = path.resolve(process.cwd(), config.get<string>('CV_STORAGE_PATH', './storage/cvs'));
  }

  /** CVs uploaded before the app could read them get their text filled in once, on start. */
  async onApplicationBootstrap() {
    // Never let this stop the API from starting (for example before a database update has been applied).
    const pending = await this.prisma.cVProfile.findMany({ where: { filePath: { not: null }, textContent: null } }).catch(() => []);
    for (const cv of pending) {
      const abs = await this.resolveFile(cv);
      if (!abs) continue;
      await this.storeText(cv.id, await fs.readFile(abs), cv.originalFileName ?? cv.filePath ?? '').catch(() => undefined);
    }
  }

  /** Reads the CV file (PDF or DOCX, whichever reads better) and keeps its text and years of experience; scoring and emails use only these. */
  private async storeText(id: string, buffer: Buffer, fileName: string) {
    const text = await extractCvText(buffer, fileName);
    await this.prisma.cVProfile.update({
      where: { id },
      data: { textContent: text, experienceYears: text ? cvFacts(text).years : null },
    });
  }

  list() {
    return this.prisma.cVProfile.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async get(id: string) {
    const cv = await this.prisma.cVProfile.findUnique({ where: { id } });
    if (!cv) throw new NotFoundException('CV profile not found');
    return cv;
  }

  create(dto: CreateCvProfileDto) {
    return this.prisma.cVProfile.create({ data: dto });
  }

  async update(id: string, dto: UpdateCvProfileDto) {
    await this.get(id);
    return this.prisma.cVProfile.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const cv = await this.get(id);
    await this.prisma.cVProfile.delete({ where: { id } });
    await this.deleteFile(cv.filePath);
    await this.deleteFile(cv.sendPdfPath);
  }

  /** Absolute path of the stored file, or null when none/missing. Guards against path traversal. */
  async resolveFile(cv: { filePath: string | null }): Promise<string | null> {
    if (!cv.filePath) return null;
    const abs = path.resolve(this.dir, path.basename(cv.filePath));
    try {
      await fs.access(abs);
      return abs;
    } catch {
      return null;
    }
  }

  /**
   * Absolute path of the PDF to email for this CV - always the one you uploaded yourself for
   * sending, never the analysis file. Null when none has been uploaded yet.
   */
  async resolveAttachment(cv: { sendPdfPath: string | null }): Promise<string | null> {
    if (!cv.sendPdfPath) return null;
    return this.resolveFile({ filePath: cv.sendPdfPath });
  }

  /** The CV file used to read skills/experience for scoring and emails. Accepts PDF or DOCX - pick whichever one reads better. */
  async saveFile(id: string, file: { originalname: string; buffer: Buffer }) {
    const cv = await this.get(id);
    const ext = validateCvUpload(file.originalname, file.buffer);
    await fs.mkdir(this.dir, { recursive: true });
    const stored = `${randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.dir, stored), file.buffer);
    await this.prisma.cVProfile.update({
      where: { id },
      data: { filePath: stored, originalFileName: path.basename(file.originalname).slice(0, 200) },
    });
    await this.deleteFile(cv.filePath);
    await this.storeText(id, file.buffer, file.originalname);
    this.logger.log({ event: 'cv.uploaded', cvId: id, bytes: file.buffer.length });
    return this.get(id);
  }

  /** The PDF actually attached to application emails. Uploaded by you, on purpose - never generated. */
  async saveSendPdf(id: string, file: { originalname: string; buffer: Buffer }) {
    const cv = await this.get(id);
    validateSendPdfUpload(file.originalname, file.buffer);
    await fs.mkdir(this.dir, { recursive: true });
    const stored = `${randomUUID()}.pdf`;
    await fs.writeFile(path.join(this.dir, stored), file.buffer);
    await this.prisma.cVProfile.update({
      where: { id },
      data: { sendPdfPath: stored, sendPdfOriginalFileName: path.basename(file.originalname).slice(0, 200) },
    });
    await this.deleteFile(cv.sendPdfPath);
    this.logger.log({ event: 'cv.send_pdf_uploaded', cvId: id, bytes: file.buffer.length });
    return this.get(id);
  }

  private async deleteFile(filePath: string | null) {
    if (!filePath) return;
    await fs.unlink(path.resolve(this.dir, path.basename(filePath))).catch(() => undefined);
  }
}
