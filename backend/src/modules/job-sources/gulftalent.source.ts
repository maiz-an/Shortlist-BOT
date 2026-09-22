import { Injectable, Logger } from '@nestjs/common';
import { JobType } from '@prisma/client';
import { EMAIL_RE } from '../email/email-draft';
import { extractEmail } from '../../common/utils/normalize';
import { toPlainText } from '../../common/utils/sanitize';
import { JobSource, JobSourceError, RawJob, SearchCriteria } from './job-source.interface';

/** One item from the Apify GulfTalent actor. Field names vary a little between actors, so every one is optional. */
export interface GulfTalentItem {
  jobId?: string | number | null;
  title?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | { text?: string; html?: string; markdown?: string } | null;
  descriptionText?: string | null;
  descriptionMarkdown?: string | null;
  descriptionHtml?: string | null;
  applyUrl?: string | null;
  url?: string | null;
  postedAt?: string | null;
  postedDateIso?: string | null;
  employmentType?: string | null;
  extractedEmails?: string[] | null;
}

function descriptionOf(i: GulfTalentItem): string | undefined {
  const d = i.description;
  const raw = (typeof d === 'string' ? d : d?.text ?? d?.markdown ?? d?.html) ?? i.descriptionText ?? i.descriptionMarkdown ?? i.descriptionHtml;
  return raw ? toPlainText(raw).slice(0, 12000) : undefined;
}

function typeOf(s?: string | null): JobType | undefined {
  const t = (s ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (t.includes('parttime')) return 'PART_TIME';
  if (t.includes('contract') || t.includes('freelance')) return 'CONTRACT';
  if (t.includes('intern')) return 'INTERNSHIP';
  if (t.includes('temp')) return 'TEMPORARY';
  if (t.includes('fulltime') || t.includes('permanent')) return 'FULL_TIME';
  return undefined;
}

/** Turns actor items into the app's job shape; items without a title or company are dropped. */
export function mapGulfTalentItems(items: GulfTalentItem[]): RawJob[] {
  const out: RawJob[] = [];
  for (const i of items) {
    const title = (i.title ?? i.jobTitle)?.trim();
    const company = i.company?.trim();
    if (!title || !company) continue;
    const description = descriptionOf(i);
    const posted = new Date(i.postedAt ?? i.postedDateIso ?? '');
    out.push({
      sourceKey: 'gulftalent',
      sourceJobId: i.jobId != null ? String(i.jobId) : undefined,
      title, company,
      location: i.location?.trim() || undefined,
      description,
      url: i.applyUrl ?? i.url ?? undefined,
      postedAt: Number.isNaN(posted.getTime()) ? undefined : posted,
      jobType: typeOf(i.employmentType),
      applicationEmail: (i.extractedEmails ?? []).find((e) => EMAIL_RE.test(e)) ?? extractEmail(description ?? '') ?? undefined,
    });
  }
  return out;
}

/**
 * GulfTalent (Qatar) jobs through a ready-made Apify actor, using Apify's free monthly credit.
 * GulfTalent blocks direct automated access, so the actor does the fetching on Apify's side; this app only
 * calls Apify's public API. Needs APIFY_TOKEN in backend/.env (a free Apify account is enough).
 */
@Injectable()
export class GulfTalentSource implements JobSource {
  readonly key = 'gulftalent';
  readonly name = 'GulfTalent (via Apify)';
  private readonly logger = new Logger(GulfTalentSource.name);

  async search(c: SearchCriteria): Promise<RawJob[]> {
    const token = process.env.APIFY_TOKEN?.trim();
    if (!token) throw new JobSourceError(this.key, 'Add APIFY_TOKEN to backend/.env to use GulfTalent (a free Apify account is enough). See SETUP.md.');
    if ((c.page ?? 0) > 0) return []; // one run returns everything asked for; more pages would only cost more

    const actor = (process.env.APIFY_GULFTALENT_ACTOR || 'blackfalcondata~gulftalent-scraper').replace('/', '~');
    const country = process.env.APIFY_COUNTRY || 'QA';
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=120&format=json&clean=true`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: c.keyword, country, location: c.location || undefined, maxResults: Math.min(Math.max(c.limit ?? 25, 1), 50), includeDetails: true }),
        signal: AbortSignal.timeout(150_000),
      });
    } catch (err) {
      throw new JobSourceError(this.key, 'Could not reach Apify. Check your internet connection.', err);
    }
    if (res.status === 401 || res.status === 403) throw new JobSourceError(this.key, 'Apify rejected the token. Check APIFY_TOKEN in backend/.env.');
    if (res.status === 402) throw new JobSourceError(this.key, 'Your free Apify credit for this month is used up. It renews next month; GulfTalent is paused until then.');
    if (res.status === 404) throw new JobSourceError(this.key, `Apify actor "${actor}" was not found. Set APIFY_GULFTALENT_ACTOR in backend/.env.`);
    if (res.status === 429) throw new JobSourceError(this.key, 'Apify is rate limiting this account. Try again later.');
    if (!res.ok) throw new JobSourceError(this.key, `Apify returned HTTP ${res.status}.`);

    let items: GulfTalentItem[];
    try {
      const data = (await res.json()) as unknown;
      items = Array.isArray(data) ? (data as GulfTalentItem[]) : [];
    } catch (err) {
      throw new JobSourceError(this.key, 'Apify returned data the app could not read.', err);
    }
    const jobs = mapGulfTalentItems(items);
    this.logger.log({ event: 'source.fetched', source: this.key, keyword: c.keyword, raw: items.length, valid: jobs.length });
    return jobs;
  }
}
