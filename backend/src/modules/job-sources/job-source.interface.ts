import { DatePostedFilter, JobType, RemotePreference } from '@prisma/client';

export const JOB_SOURCES = Symbol('JOB_SOURCES');

export interface SearchCriteria {
  keyword: string;
  location?: string;
  datePosted?: DatePostedFilter;
  jobType?: JobType;
  remote?: RemotePreference;
  experienceLevel?: string;
  sortBy?: 'recent' | 'relevant';
  /** Zero-based page index. */
  page?: number;
  /** Max results for this call. */
  limit?: number;
  /** Minimum delay between outbound requests to the source. */
  rateLimitMs?: number;
  /** Whether the source may make extra per-job requests to obtain full descriptions. */
  fetchDescriptions?: boolean;
  maxDescriptionFetches?: number;
}

/** Source-agnostic job shape produced by every JobSource. */
export interface RawJob {
  sourceKey: string;
  sourceJobId?: string;
  title: string;
  company: string;
  location?: string;
  description?: string;
  url?: string;
  postedAt?: Date;
  jobType?: JobType;
  applicationEmail?: string;
  raw?: unknown;
}

export interface JobSource {
  readonly key: string;
  readonly name: string;
  search(criteria: SearchCriteria): Promise<RawJob[]>;
}

export class JobSourceError extends Error {
  constructor(readonly sourceKey: string, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'JobSourceError';
  }
}
