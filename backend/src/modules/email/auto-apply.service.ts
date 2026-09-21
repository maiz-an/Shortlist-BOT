import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { AutoApplySettings, SettingsService } from '../settings/settings.service';
import { EmailGenerationService } from './email-generation.service';
import { EmailSendService } from './email-send.service';
import { EMAIL_PROVIDER, EmailProvider } from './email-provider';

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
        this.logger.log({ event: 'autoapply.skipped', jobId, reason: blocker });
        return { applied: false, reason: blocker };
      }

      const app = await this.apps.ensureForJob(jobId);
      const { generatedBy } = await this.generation.generate(app.id);
      if (generatedBy !== 'ai') {
        // Never auto-send a fallback template; a person should look at it.
        this.logger.log({ event: 'autoapply.skipped', jobId, reason: 'the AI could not write the email' });
        return { applied: false, reason: 'the AI could not write the email' };
      }
      await this.apps.update(app.id, { notes: `Applied automatically (match ${job.analysis.finalMatchScore}%).` });
      await this.sender.send(app.id, { confirm: true });
      this.logger.log({ event: 'autoapply.sent', jobId, applicationId: app.id, score: job.analysis.finalMatchScore });
      return { applied: true };
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.warn({ event: 'autoapply.failed', jobId, error: reason });
      return { applied: false, reason };
    }
  }
}
