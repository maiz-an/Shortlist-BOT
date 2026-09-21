import { Injectable, Logger } from '@nestjs/common';
import { JobType } from '@prisma/client';
import * as cheerio from 'cheerio';
import { extractEmail } from '../../common/utils/normalize';
import { toPlainText } from '../../common/utils/sanitize';
import { JobSource, JobSourceError, RawJob, SearchCriteria } from './job-source.interface';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const linkedinApi: { query: (q: Record<string, unknown>) => Promise<LinkedInListing[]> } = require('linkedin-jobs-api');

export interface LinkedInListing {
  position: string;
  company: string;
  location: string;
  date?: string;
  salary?: string;
  jobUrl?: string;
  agoTime?: string;
}

const DATE_MAP = { PAST_24_HOURS: '24hr', PAST_WEEK: 'past week', PAST_MONTH: 'past month', ANY_TIME: '' } as const;
const TYPE_MAP: Partial<Record<JobType, string>> = {
  FULL_TIME: 'full time', PART_TIME: 'part time', CONTRACT: 'contract', INTERNSHIP: 'internship', TEMPORARY: 'temporary',
};
const REMOTE_MAP = { REMOTE: 'remote', ON_SITE: 'on-site', HYBRID: 'hybrid', ANY: '' } as const;
const EXPERIENCE = new Set(['internship', 'entry level', 'associate', 'senior', 'director', 'executive']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function linkedInJobId(url?: string): string | undefined {
  return url?.match(/-(\d{6,})(?:\?|$|\/)/)?.[1] ?? url?.match(/currentJobId=(\d+)/)?.[1];
}

export function mapCriteria(c: SearchCriteria): Record<string, unknown> {
  const exp = c.experienceLevel?.toLowerCase();
  return {
    keyword: c.keyword,
    location: c.location ?? '',
    dateSincePosted: DATE_MAP[c.datePosted ?? 'PAST_WEEK'],
    jobType: c.jobType ? (TYPE_MAP[c.jobType] ?? '') : '',
    remoteFilter: REMOTE_MAP[c.remote ?? 'ANY'],
    experienceLevel: exp && EXPERIENCE.has(exp) ? exp : '',
    sortBy: c.sortBy ?? 'recent',
    page: c.page ?? 0,
    limit: c.limit ?? 25,
  };
}

export function mapListing(l: LinkedInListing, sourceKey = 'linkedin'): RawJob | null {
  if (!l?.position || !l?.company) return null; // malformed row
  const posted = l.date ? new Date(l.date) : undefined;
  return {
    sourceKey,
    sourceJobId: linkedInJobId(l.jobUrl),
    title: toPlainText(l.position),
    company: toPlainText(l.company),
    location: toPlainText(l.location) || undefined,
    url: l.jobUrl || undefined,
    postedAt: posted && !isNaN(posted.getTime()) ? posted : undefined,
    raw: l,
  };
}

/** LinkedIn public guest listings via the `linkedin-jobs-api` package. No login, no CAPTCHA handling. */
@Injectable()
export class LinkedInSource implements JobSource {
  readonly key = 'linkedin';
  readonly name = 'LinkedIn';
  private readonly logger = new Logger(LinkedInSource.name);

  async search(criteria: SearchCriteria): Promise<RawJob[]> {
    let listings: LinkedInListing[];
    try {
      listings = await this.fetchList(criteria);
    } catch (err) {
      throw new JobSourceError(this.key, `LinkedIn unavailable: ${(err as Error).message}`, err);
    }
    const jobs = (listings ?? []).map((l) => mapListing(l, this.key)).filter((j): j is RawJob => !!j);
    this.logger.log({ event: 'source.fetched', source: this.key, keyword: criteria.keyword, raw: listings?.length ?? 0, valid: jobs.length });

    if (criteria.fetchDescriptions !== false) await this.enrich(jobs, criteria);
    return jobs;
  }

  protected fetchList(criteria: SearchCriteria) {
    return linkedinApi.query(mapCriteria(criteria));
  }

  protected async fetchDetail(id: string): Promise<{ description: string; jobType?: JobType } | null> {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 429) throw new Error('rate limited (429)');
    if (!res.ok) return null;
    const $ = cheerio.load(await res.text());
    const description = toPlainText($('.show-more-less-html__markup').html() ?? '');
    const criteria = $('.description__job-criteria-text').map((_, e) => $(e).text().trim().toLowerCase()).get();
    const jobType = criteria.includes('full-time') ? 'FULL_TIME' : criteria.includes('part-time') ? 'PART_TIME'
      : criteria.includes('contract') ? 'CONTRACT' : criteria.includes('internship') ? 'INTERNSHIP' : undefined;
    return description ? { description, jobType } : null;
  }

  /** Best-effort, rate-limited description fetch. Stops on 429 rather than pushing through. */
  private async enrich(jobs: RawJob[], c: SearchCriteria) {
    const max = c.maxDescriptionFetches ?? 25;
    const delay = Math.max(c.rateLimitMs ?? 3000, 1000);
    let fetched = 0;
    for (const job of jobs) {
      if (fetched >= max || !job.sourceJobId) continue;
      if (fetched > 0) await sleep(delay);
      fetched++;
      try {
        const d = await this.fetchDetail(job.sourceJobId);
        if (d) {
          job.description = d.description;
          job.jobType = d.jobType;
          job.applicationEmail = extractEmail(d.description) ?? undefined;
        }
      } catch (err) {
        this.logger.warn({ event: 'source.detail_failed', source: this.key, reason: (err as Error).message });
        if ((err as Error).message.includes('429')) break;
      }
    }
  }
}
