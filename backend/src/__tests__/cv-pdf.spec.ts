import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CvProfilesService, validateCvUpload, validateSendPdfUpload } from '../modules/cv-profiles/cv-profiles.service';

describe('validateCvUpload', () => {
  const pdfBytes = Buffer.from('%PDF-1.4\n%\n1 0 obj');
  const docxBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const docBytes = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

  it('accepts PDF and DOCX', () => {
    expect(validateCvUpload('resume.pdf', pdfBytes)).toBe('.pdf');
    expect(validateCvUpload('resume.docx', docxBytes)).toBe('.docx');
  });

  it('rejects an old .doc file with a clear reason', () => {
    expect(() => validateCvUpload('resume.doc', docBytes)).toThrow(/doc.*can't be read/i);
  });

  it('rejects content that does not match its extension', () => {
    expect(() => validateCvUpload('resume.pdf', docxBytes)).toThrow(/does not match/i);
  });
});

describe('validateSendPdfUpload', () => {
  const pdfBytes = Buffer.from('%PDF-1.4\n%\n1 0 obj');
  const docxBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

  it('accepts a real PDF', () => {
    expect(() => validateSendPdfUpload('resume.pdf', pdfBytes)).not.toThrow();
  });

  it('rejects anything that is not a PDF, even a DOCX', () => {
    expect(() => validateSendPdfUpload('resume.docx', docxBytes)).toThrow(/must be a PDF/i);
  });

  it('rejects content that does not match a .pdf extension', () => {
    expect(() => validateSendPdfUpload('resume.pdf', docxBytes)).toThrow(/does not match/i);
  });
});

describe('CvProfilesService.resolveAttachment', () => {
  let dir: string;
  let svc: CvProfilesService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvpdf-'));
    // Importing CvProfilesService pulls in @prisma/client, which loads backend/.env as an import
    // side effect - including a real CV_STORAGE_PATH. ConfigService checks process.env before the
    // object passed to its constructor, so that leaked value would win unless overridden here.
    process.env.CV_STORAGE_PATH = dir;
    const config = new ConfigService({ CV_STORAGE_PATH: dir });
    // Only resolveFile/resolveAttachment are exercised here, neither touches prisma.
    svc = new CvProfilesService({} as never, config);
  });

  afterEach(async () => {
    delete process.env.CV_STORAGE_PATH;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('uses the manually-uploaded send PDF when present', async () => {
    await fs.writeFile(path.join(dir, 'gen.pdf'), 'g');
    const abs = await svc.resolveAttachment({ sendPdfPath: 'gen.pdf' });
    expect(abs).toBe(path.resolve(dir, 'gen.pdf'));
  });

  it('returns null when no send PDF has been uploaded, even if the analysis file is a PDF', async () => {
    const abs = await svc.resolveAttachment({ sendPdfPath: null });
    expect(abs).toBeNull();
  });

  it('returns null when the send PDF was uploaded but the file is missing on disk', async () => {
    const abs = await svc.resolveAttachment({ sendPdfPath: 'missing.pdf' });
    expect(abs).toBeNull();
  });
});
