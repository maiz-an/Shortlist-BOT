import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { AutoApplySettings, SettingsService } from '../settings/settings.service';
import { EmailGenerationService } from './email-generation.service';
import { EmailSendService } from './email-send.service';
import { EMAIL_PROVIDER, EmailProvider } from './email-provider';
import { WhatsAppService } from '../whatsapp/whatsapp.module';

/** A job scoring at least this is worth having an email ready for, even before the user opens it. */
export const AUTO_DRAFT_MIN_SCORE = 50;

export interface AutoApplyFacts {
  status: string;
  score: number;
  recommendation: string;
  applicationEmail: string | null;
  gmailConnected: boolean;
  sentToday: number;
}

/**
 * Why a job must NOT be applied to automatically, or null when every safety rule passes.
 * Pure function so the rules are easy to test. The switch being off always wins.
 */
export function autoApplyBlocker(s: AutoApplySettings, f: AutoApplyFacts): string | null {
  if (!s.enabled) return 'auto-apply is off';
  if (f.status !== 'REVIEW') return `job is ${f.status}, not waiting for review`;
  if (f.recommendation !== 'APPLY') return `recommendation is ${f.recommendation}`;
  if (f.score < s.minScore) return `score ${f.score}% is below ${s.minScore}%`;
  if (!f.applicationEmail) return 'no application email on the job';
  if (!f.gmailConnected) return 'Gmail is not connected';
  if (f.sentToday >= s.dailyLimit) return `daily limit of ${s.dailyLimit} reached`;
  return null;
}

/** Sends applications by itself, but only when you turned it on and every safety rule passes. */
@Injectable()
export class AutoApplyService {
  private readonly logger = new Logger(AutoApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly apps: ApplicationsService,
    private readonly generation: EmailGenerationService,
    private readonly sender: EmailSendService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /** Called after a job newly reaches REVIEW. Never throws: a failure just leaves the job for manual review. */
  async maybeApply(jobId: string): Promise<{ applied: boolean; reason?: string }> {
    try {
      const s = await this.settings.get('auto_apply');
      if (!s.enabled) return { applied: false, reason: 'auto-apply is off' }; // fast path, no other work

      const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { analysis: true } });
      if (!job?.analysis) return { applied: false, reason: 'not analyzed' };
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [status, sentToday] = await Promise.all([this.email.status(), this.prisma.emailMessage.count({ where: { sentAt: { gte: startOfDay } } })]);

      const blocker = autoApplyBlocker(s, {
        status: job.status, score: job.analysis.finalMatchScore, recommendation: job.analysis.recommendation,
        applicationEmail: job.applicationEmail, gmailConnected: status.connected, sentToday,
      });
      if (blocker) {
        this.logger.log({ event: 'autoapply.skipped', jobId, title: job.title, company: job.company, reason: blocker });
        return { applied: false, reason: blocker };
      }

      const app = await this.apps.ensureForJob(jobId);
      const { generatedBy } = await this.generation.generate(app.id);
      if (generatedBy !== 'ai') {
        // Never auto-send a fallback template; a person should look at it.
        this.logger.log({ event: 'autoapply.skipped', jobId, title: job.title, company: job.company, reason: 'the AI could not write the email' });
        return { applied: false, reason: 'the AI could not write the email' };
      }
      await this.apps.update(app.id, { notes: `Applied automatically (match ${job.analysis.finalMatchScore}%).` });
      await this.sender.send(app.id, { confirm: true });
      this.logger.log({ event: 'autoapply.sent', jobId, title: job.title, company: job.company, applicationId: app.id, score: job.analysis.finalMatchScore });
      await this.whatsapp.notifyAutoApplied({ id: jobId, title: job.title, company: job.company }, job.analysis.finalMatchScore);
      return { applied: true };
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.warn({ event: 'autoapply.failed', jobId, error: reason });
      return { applied: false, reason };
    }
  }

  /**
   * Pre-writes an email as soon as a job first scores at least AUTO_DRAFT_MIN_SCORE, so it's ready
   * to read the moment you open the job - never sent, and never touches a draft that already exists
   * (including one you edited by hand). Safe to call after every analysis, including re-analysis.
   * Never throws: a failure just leaves the job without a pre-written draft.
   */
  async maybeAutoDraft(jobId: string): Promise<void> {
    try {
      const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { analysis: true } });
      if (!job?.analysis || job.analysis.finalMatchScore < AUTO_DRAFT_MIN_SCORE) return;

      const app = await this.apps.ensureForJob(jobId);
      const existing = await this.prisma.emailDraft.findUnique({ where: { applicationId: app.id } });
      if (existing) return; // never overwrite a draft that already exists

      const { generatedBy } = await this.generation.generate(app.id);
      this.logger.log({ event: 'autodraft.generated', jobId, title: job.title, company: job.company, score: job.analysis.finalMatchScore, generatedBy });
    } catch (err) {
      this.logger.warn({ event: 'autodraft.failed', jobId, error: (err as Error).message });
    }
  }
}
