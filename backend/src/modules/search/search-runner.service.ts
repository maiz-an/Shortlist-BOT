import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobSearchProfile, JobSource } from '@prisma/client';
import { containsTerm } from '../../common/utils/normalize';
import { PrismaService } from '../../prisma/prisma.service';
import { JobSourceRegistry } from '../job-sources/job-sources.module';
import { JobSourceError, SearchCriteria } from '../job-sources/job-source.interface';
import { AnalysisQueue } from '../job-analysis/analysis-queue.service';
import { JobsService } from '../jobs/jobs.service';
import { SettingsService } from '../settings/settings.service';

type ProfileWithSources = JobSearchProfile & { sources: JobSource[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function criteriaFor(profile: JobSearchProfile, keyword: string, page: number, opts: { rateLimitMs: number; fetchDescriptions: boolean; maxDescriptionFetches: number }): SearchCriteria {
  return {
    keyword,
    location: profile.location ?? undefined,
    datePosted: profile.datePosted,
    jobType: profile.preferredJobTypes.length === 1 ? profile.preferredJobTypes[0] : undefined,
    remote: profile.remotePreference,
    experienceLevel: profile.experienceLevel ?? undefined,
    sortBy: profile.sortBy === 'relevant' ? 'relevant' : 'recent',
    page,
    limit: 25,
    ...opts,
  };
}

@Injectable()
export class SearchRunner implements OnModuleInit {
  private readonly logger = new Logger(SearchRunner.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobSourceRegistry,
    private readonly jobs: JobsService,
    private readonly queue: AnalysisQueue,
    private readonly settings: SettingsService,
  ) {}

  /** A run can only be RUNNING in this process; anything left over was cut short by a restart. */
  async onModuleInit() {
    const res = await this.prisma.searchRun
      .updateMany({
        where: { status: 'RUNNING' },
        data: { status: 'FAILED', finishedAt: new Date(), errors: [{ source: 'system', error: 'Interrupted by a backend restart' }] },
      })
      .catch(() => ({ count: 0 }));
    if (res.count) this.logger.warn({ event: 'search.stale_runs_closed', count: res.count });
  }

  isRunning() {
    return this.running;
  }

  /** Starts a run in the background and returns immediately. */
  start(opts: { profileIds?: string[]; sourceKeys?: string[] } = {}) {
    if (this.running) throw new ConflictException('A search run is already in progress');
    this.running = true;
    void this.runAll(opts)
      .catch((err) => this.logger.error({ event: 'search.crashed', error: (err as Error).message }))
      .finally(() => (this.running = false));
  }

  private async runAll(opts: { profileIds?: string[]; sourceKeys?: string[] }) {
    const profiles = await this.prisma.jobSearchProfile.findMany({
      where: { enabled: true, ...(opts.profileIds?.length ? { id: { in: opts.profileIds } } : {}) },
      include: { sources: true },
    });
    this.logger.log({ event: 'search.started', profiles: profiles.length });
    for (const p of profiles) await this.runProfile(p, opts.sourceKeys);
  }

  async runProfile(profile: ProfileWithSources, sourceKeys?: string[]) {
    const run = await this.prisma.searchRun.create({ data: { jobSearchProfileId: profile.id } });
    const pipeline = await this.settings.get('pipeline');
    const errors: { source: string; keyword?: string; error: string }[] = [];
    let found = 0, created = 0, duplicates = 0, filtered = 0, attempted = 0, failed = 0;
    const newIds: string[] = [];

    const sources = profile.sources.filter((s) => s.enabled && (!sourceKeys?.length || sourceKeys.includes(s.key)));
    for (const row of sources) {
      const source = this.registry.get(row.key);
      if (!source) {
        errors.push({ source: row.key, error: 'Source not implemented' });
        continue;
      }
      for (const keyword of profile.keywords) {
        for (let page = 0; page < Math.max(profile.maxPages, 1); page++) {
          attempted++;
          try {
            const raw = await source.search(
              criteriaFor(profile, keyword, page, {
                rateLimitMs: row.rateLimitMs, fetchDescriptions: pipeline.fetchDescriptions, maxDescriptionFetches: pipeline.maxDescriptionFetches,
              }),
            );
            found += raw.length;
            for (const r of raw) {
              if (profile.excludedKeywords.some((k) => containsTerm(r.title, k))) {
                filtered++;
                continue;
              }
              const res = await this.jobs.ingest(r);
              if (!res) continue;
              if (res.created) {
                created++;
                newIds.push(res.jobId);
              } else duplicates++;
            }
            if (raw.length < 5) break; // no meaningful next page
          } catch (err) {
            // A failing source/keyword must never abort the run or crash the app.
            failed++;
            const msg = err instanceof JobSourceError ? err.message : `Unexpected error: ${(err as Error).message}`;
            errors.push({ source: row.key, keyword, error: msg.slice(0, 200) });
            this.logger.error({ event: 'search.source_failed', source: row.key, keyword, error: msg });
            break;
          }
          await sleep(row.rateLimitMs);
        }
        await sleep(row.rateLimitMs);
      }
    }

    this.queue.enqueue(newIds);
    const status = failed === 0 ? 'SUCCESS' : failed >= attempted ? 'FAILED' : 'PARTIAL';
    await this.prisma.searchRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), jobsFound: found, jobsNew: created, duplicatesSkipped: duplicates, errors: errors.length ? errors : undefined },
    });
    this.logger.log({ event: 'search.finished', profile: profile.name, status, found, created, duplicates, filtered, failed });
  }
}
