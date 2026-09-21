import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCvProfileDto, UpdateCvProfileDto } from './cv-profiles.dto';
import { cvFacts, extractCvText } from './cv-text';

export const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, (b: Buffer) => boolean> = {
  '.pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  '.docx': (b) => b[0] === 0x50 && b[1] === 0x4b, // zip container
  '.doc': (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0, // OLE2
};
export const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function validateCvUpload(originalName: string, buffer: Buffer): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED[ext]) throw new BadRequestException('Only PDF, DOC and DOCX files are allowed');
  if (buffer.length > MAX_CV_BYTES) throw new BadRequestException('File too large (max 5 MB)');
  if (!ALLOWED[ext](buffer)) throw new BadRequestException('File content does not match its extension');
  return ext;
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

  /** Reads the CV file and keeps its text and years of experience; scoring and emails use only these. */
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

  async saveFile(id: string, file: { originalname: string; buffer: Buffer }) {
    const cv = await this.get(id);
    const ext = validateCvUpload(file.originalname, file.buffer);
    await fs.mkdir(this.dir, { recursive: true });
    const stored = `${randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.dir, stored), file.buffer);
    const updated = await this.prisma.cVProfile.update({
      where: { id },
      data: { filePath: stored, originalFileName: path.basename(file.originalname).slice(0, 200) },
    });
    await this.deleteFile(cv.filePath);
    await this.storeText(id, file.buffer, file.originalname);
    this.logger.log({ event: 'cv.uploaded', cvId: id, bytes: file.buffer.length });
    return this.get(id);
  }

  private async deleteFile(filePath: string | null) {
    if (!filePath) return;
    await fs.unlink(path.resolve(this.dir, path.basename(filePath))).catch(() => undefined);
  }
}
