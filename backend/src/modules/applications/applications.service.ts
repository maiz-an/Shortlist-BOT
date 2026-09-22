import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildFollowUpEmail } from '../email/email-draft';
import { APPLICATION_STATUSES, assertManualTransition, defaultFollowUp, setsAppliedDate } from './status-rules';

export interface ApplicationListQuery {
  q?: string;
  status?: JobStatus;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the tracker record for a job on first need (denormalizing display fields). */
  async ensureForJob(jobId: string) {
    const existing = await this.prisma.application.findUnique({ where: { jobId } });
    if (existing) return existing;
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { analysis: true, sourceListings: { include: { jobSource: true }, take: 1, orderBy: { createdAt: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Job not found');
    return this.prisma.application.create({
      data: {
        jobId, company: job.company, jobTitle: job.title, location: job.location, jobUrl: job.jobUrl,
        source: job.sourceListings[0]?.jobSource.name ?? null,
        matchScore: job.analysis?.finalMatchScore ?? null,
        selectedCvId: job.analysis?.recommendedCvId ?? null,
        status: APPLICATION_STATUSES.includes(job.status) ? job.status : 'REVIEW',
        ...(APPLICATION_STATUSES.includes(job.status) ? { statusHistory: { create: { fromStatus: null, toStatus: job.status } } } : {}),
      },
    });
  }

  /** Single place that mutates workflow status, keeping Job, Application and history consistent. */
  async setStatus(jobId: string, to: JobStatus, opts: { note?: string; manual?: boolean } = {}) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { application: true } });
    if (!job) throw new NotFoundException('Job not found');
    const from = job.status; // Job.status is authoritative; Application mirrors it
    if (opts.manual) assertManualTransition(from, to);
    if (from === to && !opts.note) return job.application;

    const needsApp = APPLICATION_STATUSES.includes(to);
    let app = job.application;
    if (needsApp && !app) app = await this.ensureForJob(jobId);

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: jobId }, data: { status: to } });
      if (app) {
        await tx.application.update({
          where: { id: app.id },
          data: {
            status: to,
            // The first time an application is sent, remind the user to follow up a week later (unless they already chose a date).
            ...(setsAppliedDate(to) && !app.appliedDate
              ? { appliedDate: new Date(), ...(app.followUpDate ? {} : { followUpDate: defaultFollowUp(new Date()) }) }
              : {}),
          },
        });
        await tx.applicationStatusHistory.create({ data: { applicationId: app.id, fromStatus: from, toStatus: to, note: opts.note } });
      }
    });
    this.logger.log({ event: 'status.changed', jobId, from, to, manual: !!opts.manual });
    return app ? this.prisma.application.findUnique({ where: { id: app.id } }) : null;
  }

  async setStatusByApplication(id: string, to: JobStatus, note?: string) {
    const app = await this.get(id);
    return this.setStatus(app.jobId, to, { note, manual: true });
  }

  async list(q: ApplicationListQuery) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 100);
    const where: Prisma.ApplicationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ company: { contains: q.q, mode: 'insensitive' } }, { jobTitle: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: { selectedCv: { select: { id: true, name: true } }, emailDraft: { select: { recipient: true } } },
      }),
      this.prisma.application.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        job: { select: { id: true, description: true, applicationEmail: true } },
        selectedCv: { select: { id: true, name: true, filePath: true, originalFileName: true } },
        emailDraft: true,
        emailMessages: { orderBy: { sentAt: 'desc' } },
        statusHistory: { orderBy: { changedAt: 'desc' } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  /** Follow-up note text, the recipient the original went to, and whether one is due. */
  async followUp(id: string) {
    const app = await this.get(id);
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'candidate' } });
    const name = ((row?.value as { name?: string } | null)?.name ?? '').trim();
    const to = app.emailDraft?.recipient ?? app.job.applicationEmail ?? null;
    const note = buildFollowUpEmail({
      company: app.company, jobTitle: app.jobTitle, appliedDate: app.appliedDate, candidateName: name,
      originalSubject: app.emailMessages[0]?.subject ?? app.emailDraft?.subject ?? null,
    });
    return { to, ...note, due: !!app.followUpDate && app.followUpDate.getTime() <= Date.now() && app.status === 'APPLIED' };
  }

  async update(id: string, data: { notes?: string; followUpDate?: Date | null; interviewDate?: Date | null; selectedCvId?: string | null }) {
    await this.get(id);
    return this.prisma.application.update({ where: { id }, data });
  }
}
