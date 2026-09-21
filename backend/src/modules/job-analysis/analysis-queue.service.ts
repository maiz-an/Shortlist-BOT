import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AIUnavailableError } from '../ai/ai-provider';
import { AutoApplyService } from '../email/auto-apply.service';
import { AnalysisService } from './analysis.service';

/** Sequential in-process queue: the local LLM handles one job at a time. */
@Injectable()
export class AnalysisQueue implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalysisQueue.name);
  private readonly queue: string[] = [];
  private running = false;
  private current: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly analysis: AnalysisService,
    private readonly prisma: PrismaService,
    private readonly autoApply: AutoApplyService,
  ) {}

  async onApplicationBootstrap() {
    // Resume anything left unanalyzed by a previous run.
    try {
      const stuck = await this.prisma.job.findMany({ where: { status: { in: ['NEW', 'ANALYZING'] } }, select: { id: true }, take: 500 });
      this.enqueue(stuck.map((j) => j.id));
    } catch (err) {
      this.logger.warn({ event: 'queue.resume_failed', error: (err as Error).message });
    }
  }

  enqueue(ids: string | string[]) {
    for (const id of Array.isArray(ids) ? ids : [ids]) if (id !== this.current && !this.queue.includes(id)) this.queue.push(id);
    void this.drain();
  }

  status() {
    return { pending: this.queue.length, running: this.running, current: this.current, lastError: this.lastError };
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        this.current = id;
        try {
          const before = await this.prisma.job.findUnique({ where: { id }, select: { status: true } });
          await this.analysis.analyze(id);
          this.lastError = null;
          // Only a job that just moved into REVIEW may be auto-applied; re-analysing one you already handle never sends.
          const after = await this.prisma.job.findUnique({ where: { id }, select: { status: true } });
          if (before?.status !== 'REVIEW' && after?.status === 'REVIEW') await this.autoApply.maybeApply(id);
        } catch (err) {
          this.lastError = (err as Error).message;
          if (err instanceof AIUnavailableError) {
            // No point hammering an unavailable model; jobs stay NEW and can be retried from the UI.
            this.logger.warn({ event: 'queue.paused', reason: this.lastError, dropped: this.queue.length });
            this.queue.length = 0;
          }
        }
      }
    } finally {
      this.current = null;
      this.running = false;
    }
  }
}
