import { Injectable, Logger } from '@nestjs/common';
import { JobType } from '@prisma/client';
import { execFile } from 'child_process';
import * as path from 'path';
import { EMAIL_RE } from '../email/email-draft';
import { extractEmail } from '../../common/utils/normalize';
import { toPlainText } from '../../common/utils/sanitize';
import { JobSource, JobSourceError, RawJob, SearchCriteria } from './job-source.interface';

/** One row as printed by scripts/jobspy_search.py. */
export interface IndeedRow {
  id?: string | null;
  job_url?: string | null;
  job_url_direct?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  date_posted?: string | null;
  job_type?: string | null;
  is_remote?: boolean | null;
  emails?: string | string[] | null;
  description?: string | null;
}

const TYPE_TO_ARG: Partial<Record<JobType, string>> = { FULL_TIME: 'fulltime', PART_TIME: 'parttime', CONTRACT: 'contract', INTERNSHIP: 'internship' };
const TYPE_FROM_ROW: Record<string, JobType> = { fulltime: 'FULL_TIME', parttime: 'PART_TIME', contract: 'CONTRACT', internship: 'INTERNSHIP' };
const HOURS = { PAST_24_HOURS: 24, PAST_WEEK: 168, PAST_MONTH: 720, ANY_TIME: 0 } as const;

/** Turns JobSpy rows into the app's job shape. Rows without a title or company are dropped. */
export function mapIndeedRows(rows: IndeedRow[]): RawJob[] {
  const out: RawJob[] = [];
  for (const r of rows) {
    const title = r.title?.trim();
    const company = r.company?.trim();
    if (!title || !company) continue;
    const description = r.description ? toPlainText(r.description).slice(0, 12000) : undefined;
    const listed = (Array.isArray(r.emails) ? r.emails : (r.emails ?? '').split(/[,\s]+/)).find((e) => EMAIL_RE.test(e));
    const posted = r.date_posted ? new Date(r.date_posted) : undefined;
    out.push({
      sourceKey: 'indeed',
      sourceJobId: r.id ?? undefined,
      title, company,
      location: r.location?.trim() || undefined,
      description,
      url: r.job_url_direct ?? r.job_url ?? undefined,
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : undefined,
      jobType: r.job_type ? TYPE_FROM_ROW[r.job_type.toLowerCase().replace(/[^a-z]/g, '')] : undefined,
      applicationEmail: listed ?? extractEmail(description ?? '') ?? undefined,
    });
  }
  return out;
}

/**
 * Indeed listings through the open-source JobSpy library (https://github.com/speedyapply/JobSpy).
 * Optional: it needs Python and `pip install python-jobspy`. Without them this source reports how to set it up
 * and nothing else in the app is affected. One small, unauthenticated request per search; no proxies, no login.
 */
@Injectable()
export class IndeedSource implements JobSource {
  readonly key = 'indeed';
  readonly name = 'Indeed (via JobSpy)';
  private readonly logger = new Logger(IndeedSource.name);
  private readonly script = path.resolve(__dirname, '../../../scripts/jobspy_search.py');

  private python(): string {
    return process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  }

  async search(c: SearchCriteria): Promise<RawJob[]> {
    const country = process.env.INDEED_COUNTRY || 'Qatar';
    const args = JSON.stringify({
      keyword: c.keyword, location: c.location, country,
      limit: Math.min(Math.max(c.limit ?? 20, 1), 30),
      hoursOld: HOURS[c.datePosted ?? 'PAST_WEEK'],
      jobType: c.jobType ? TYPE_TO_ARG[c.jobType] : undefined,
      remote: c.remote === 'REMOTE',
    });
    // Only the first page is ever requested, so later pages of the same search add nothing.
    if ((c.page ?? 0) > 0) return [];

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(this.python(), [this.script, args], { timeout: 90_000, maxBuffer: 30 * 1024 * 1024, windowsHide: true }, (err, out, errOut) => {
        if (!err) return resolve(out);
        const code = (err as { code?: unknown }).code;
        if (code === 'ENOENT') return reject(new JobSourceError(this.key, 'Python was not found. Install Python 3.10+ (or set PYTHON_BIN in backend/.env) to use Indeed.', err));
        if (code === 3) return reject(new JobSourceError(this.key, 'JobSpy is not installed. Run: pip install python-jobspy   (on Python 3.13+ also: pip install -U numpy pandas)', err));
        reject(new JobSourceError(this.key, `Indeed search failed: ${(errOut || err.message).toString().trim().split('\n').pop()?.slice(0, 200)}`, err));
      });
    });

    let rows: IndeedRow[];
    try {
      rows = JSON.parse(stdout || '[]') as IndeedRow[];
    } catch (err) {
      throw new JobSourceError(this.key, 'Indeed returned data the app could not read.', err);
    }
    const jobs = mapIndeedRows(rows);
    this.logger.log({ event: 'source.fetched', source: this.key, keyword: c.keyword, raw: rows.length, valid: jobs.length });
    return jobs;
  }
}
