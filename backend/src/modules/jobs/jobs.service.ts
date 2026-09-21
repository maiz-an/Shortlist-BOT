import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { canonicalUrl, extractEmail, normalizeCompany, normalizeLocation, normalizeTitle } from '../../common/utils/normalize';
import { toPlainText } from '../../common/utils/sanitize';
import { PrismaService } from '../../prisma/prisma.service';
import { RawJob } from '../job-sources/job-source.interface';
import { detectDuplicate, DuplicateReason } from './dedupe';

export interface IngestResult {
  jobId: string;
  created: boolean;
  duplicateReason?: DuplicateReason | 'source-id';
}

export interface JobListQuery {
  q?: string;
  status?: JobStatus;
  minScore?: number;
  recommendation?: string;
  sourceKey?: string;
  sort?: 'createdAt' | 'postedAt' | 'matchScore';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Cleans and normalizes a raw job from any source. Returns null when it lacks the minimum fields. */
export function normalizeRawJob(raw: RawJob) {
  const title = toPlainText(raw.title).slice(0, 300);
  const company = toPlainText(raw.company).slice(0, 200);
  if (!title || !company) return null;
  const description = toPlainText(raw.description).slice(0, 20000);
  const location = toPlainText(raw.location).slice(0, 200) || null;
  return {
    title,
    company,
    location,
    description,
    normalizedTitle: normalizeTitle(title),
    normalizedCompany: normalizeCompany(company),
    normalizedLocation: normalizeLocation(location),
    jobUrl: canonicalUrl(raw.url),
    jobType: raw.jobType ?? null,
    postedAt: raw.postedAt ?? null,
    applicationEmail: raw.applicationEmail ?? extractEmail(description),
  };
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(private readonly prisma: PrismaService) {}

  private async sourceId(key: string, name = key): Promise<string> {
    const s = await this.prisma.jobSource.upsert({
      where: { key },
      update: {},
      create: { key, name, enabled: key !== 'manual' },
    });
    return s.id;
  }

  /** Stores a job, merging into an existing one when it is a duplicate (from any source). */
  async ingest(raw: RawJob, opts: { isManual?: boolean } = {}): Promise<IngestResult | null> {
    const n = normalizeRawJob(raw);
    if (!n) {
      this.logger.warn({ event: 'job.malformed', source: raw.sourceKey });
      return null;
    }
    const jobSourceId = await this.sourceId(raw.sourceKey);
    const link = (jobId: string) =>
      this.prisma.jobSourceListing.upsert({
        where: { jobSourceId_sourceJobId: { jobSourceId, sourceJobId: raw.sourceJobId ?? `url:${n.jobUrl ?? randomKey(n)}` } },
        update: {},
        create: {
          jobId, jobSourceId, sourceJobId: raw.sourceJobId ?? `url:${n.jobUrl ?? randomKey(n)}`,
          sourceUrl: raw.url ?? null, rawData: (raw.raw ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

    // 1. Exact source listing already stored.
    if (raw.sourceJobId) {
      const existing = await this.prisma.jobSourceListing.findUnique({
        where: { jobSourceId_sourceJobId: { jobSourceId, sourceJobId: raw.sourceJobId } },
      });
      if (existing) {
        await this.mergeMissing(existing.jobId, n);
        return { jobId: existing.jobId, created: false, duplicateReason: 'source-id' };
      }
    }

    // 2. URL / company+title+location / description similarity.
    const candidates = await this.prisma.job.findMany({
      where: { OR: [...(n.jobUrl ? [{ jobUrl: n.jobUrl }] : []), { normalizedCompany: n.normalizedCompany }] },
      take: 300,
      select: { id: true, normalizedCompany: true, normalizedTitle: true, normalizedLocation: true, jobUrl: true, description: true },
    });
    const incoming = { ...n, canonicalUrl: n.jobUrl, normalizedLocation: n.normalizedLocation };
    for (const c of candidates) {
      const reason = detectDuplicate(incoming, {
        normalizedCompany: c.normalizedCompany, normalizedTitle: c.normalizedTitle,
        normalizedLocation: c.normalizedLocation ?? '', canonicalUrl: c.jobUrl, description: c.description,
      });
      if (reason) {
        await link(c.id);
        await this.mergeMissing(c.id, n);
        return { jobId: c.id, created: false, duplicateReason: reason };
      }
    }

    const job = await this.prisma.job.create({
      data: {
        title: n.title, company: n.company, location: n.location, description: n.description,
        normalizedTitle: n.normalizedTitle, normalizedCompany: n.normalizedCompany, normalizedLocation: n.normalizedLocation,
        jobUrl: n.jobUrl, jobType: n.jobType, postedAt: n.postedAt, applicationEmail: n.applicationEmail,
        isManual: !!opts.isManual,
      },
    });
    await link(job.id);
    return { jobId: job.id, created: true };
  }

  private async mergeMissing(jobId: string, n: ReturnType<typeof normalizeRawJob>) {
    if (!n) return;
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;
    const data: Prisma.JobUpdateInput = {};
    if (!job.description && n.description) data.description = n.description;
    if (!job.applicationEmail && n.applicationEmail) data.applicationEmail = n.applicationEmail;
    if (!job.postedAt && n.postedAt) data.postedAt = n.postedAt;
    if (Object.keys(data).length) await this.prisma.job.update({ where: { id: jobId }, data });
  }

  async list(q: JobListQuery) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 100);
    const and: Prisma.JobWhereInput[] = [];
    if (q.q) {
      and.push({ OR: [
        { title: { contains: q.q, mode: 'insensitive' } },
        { company: { contains: q.q, mode: 'insensitive' } },
        { location: { contains: q.q, mode: 'insensitive' } },
      ] });
    }
    if (q.status) and.push({ status: q.status });
    if (q.minScore !== undefined) and.push({ analysis: { is: { finalMatchScore: { gte: q.minScore } } } });
    if (q.recommendation) and.push({ analysis: { is: { recommendation: q.recommendation as never } } });
    if (q.sourceKey) and.push({ sourceListings: { some: { jobSource: { key: q.sourceKey } } } });
    const where: Prisma.JobWhereInput = and.length ? { AND: and } : {};
    const dir = q.order ?? 'desc';
    const orderBy: Prisma.JobOrderByWithRelationInput =
      q.sort === 'matchScore' ? { analysis: { finalMatchScore: dir } } : q.sort === 'postedAt' ? { postedAt: dir } : { createdAt: dir };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, title: true, company: true, location: true, jobUrl: true, status: true, postedAt: true, createdAt: true,
          analysis: { select: { finalMatchScore: true, recommendation: true, category: true, recommendedCv: { select: { id: true, name: true } } } },
          sourceListings: { select: { jobSource: { select: { key: true, name: true } } } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        sourceListings: { include: { jobSource: { select: { key: true, name: true } } } },
        analysis: { include: { recommendedCv: { select: { id: true, name: true, category: true } } } },
        application: { include: { emailDraft: true, selectedCv: { select: { id: true, name: true, filePath: true } }, emailMessages: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.job.delete({ where: { id } });
  }
}

function randomKey(n: { normalizedTitle: string; normalizedCompany: string }) {
  return `${n.normalizedCompany}|${n.normalizedTitle}`;
}
