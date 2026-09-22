export const JOB_STATUSES = [
  'NEW', 'ANALYZING', 'ANALYZED', 'REVIEW', 'APPROVED', 'SENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'INTERVIEW', 'OFFER', 'CLOSED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
/** Statuses the user may set by hand (the rest are system-controlled). */
export const MANUAL_STATUSES = JOB_STATUSES.filter((s) => !['NEW', 'ANALYZING', 'SENDING'].includes(s));

export type Recommendation = 'APPLY' | 'MAYBE' | 'SKIP';
export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'TEMPORARY' | 'UNKNOWN';
export type RemotePreference = 'REMOTE' | 'ON_SITE' | 'HYBRID' | 'ANY';
export type DatePosted = 'PAST_24_HOURS' | 'PAST_WEEK' | 'PAST_MONTH' | 'ANY_TIME';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobListItem {
  id: string;
  title: string;
  company: string;
  location: string | null;
  jobUrl: string | null;
  status: JobStatus;
  postedAt: string | null;
  createdAt: string;
  analysis: { finalMatchScore: number; recommendation: Recommendation; category: string; recommendedCv: { id: string; name: string } | null } | null;
  sourceListings: { jobSource: { key: string; name: string } }[];
}

export interface Analysis {
  category: string;
  aiMatchScore: number;
  finalMatchScore: number;
  recommendedCv: { id: string; name: string; category: string } | null;
  matchedSkills: string[];
  missingSkills: string[];
  experienceRequired: string | null;
  experienceCompatible: boolean;
  locationCompatible: boolean;
  salaryMentioned: boolean;
  applicationMethod: string;
  recommendation: Recommendation;
  reason: string | null;
  rawAiResponse?: { breakdown?: Record<string, number> } | null;
}

export interface EmailDraft {
  id: string;
  applicationId: string;
  recipient: string | null;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface EmailMessage {
  id: string;
  sentAt: string;
  recipient: string;
  subject: string;
  body: string;
  selectedCvPath: string | null;
  provider: string;
  providerMessageId: string | null;
  application?: { id: string; company: string; jobTitle: string };
}

export interface ApplicationBase {
  id: string;
  jobId: string;
  company: string;
  jobTitle: string;
  location: string | null;
  source: string | null;
  jobUrl: string | null;
  matchScore: number | null;
  selectedCvId: string | null;
  status: JobStatus;
  appliedDate: string | null;
  notes: string | null;
  followUpDate: string | null;
  interviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationListItem extends ApplicationBase {
  selectedCv: { id: string; name: string } | null;
  emailDraft: { recipient: string | null } | null;
}

export interface ApplicationDetail extends ApplicationBase {
  job: { id: string; description: string; applicationEmail: string | null };
  selectedCv: { id: string; name: string; filePath: string | null; originalFileName: string | null } | null;
  emailDraft: EmailDraft | null;
  emailMessages: EmailMessage[];
  statusHistory: { id: string; fromStatus: JobStatus | null; toStatus: JobStatus; note: string | null; changedAt: string }[];
}

export interface JobDetail {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  jobUrl: string | null;
  jobType: JobType | null;
  applicationEmail: string | null;
  postedAt: string | null;
  status: JobStatus;
  analysisError: string | null;
  createdAt: string;
  sourceListings: { id: string; sourceUrl: string | null; foundAt: string; jobSource: { key: string; name: string } }[];
  analysis: Analysis | null;
  application: { id: string; selectedCvId: string | null; status: JobStatus; emailDraft: EmailDraft | null } | null;
}

export interface CvProfile {
  id: string;
  name: string;
  description: string | null;
  category: string;
  filePath: string | null;
  originalFileName: string | null;
  /** The name of the PDF you uploaded yourself for sending, if any - independent of the analysis file above. */
  sendPdfOriginalFileName: string | null;
  enabled: boolean;
  skills: string[];
  preferredJobKeywords: string[];
  excludedKeywords: string[];
  experienceYears?: number | null;
  textReadable?: boolean;
  fileExists?: boolean;
  /** Whether a PDF has been uploaded for sending. */
  sendPdfReady?: boolean;
}

export interface JobSourceRow {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  rateLimitMs: number;
  implemented: boolean;
  listingCount: number;
}

export interface SearchProfile {
  id: string;
  name: string;
  keywords: string[];
  location: string | null;
  minMatchScore: number;
  excludedKeywords: string[];
  preferredJobTypes: JobType[];
  preferredLocations: string[];
  remotePreference: RemotePreference;
  datePosted: DatePosted;
  experienceLevel: string | null;
  sortBy: string;
  maxPages: number;
  enabled: boolean;
  sources: { id: string; key: string; name: string }[];
}

export interface SearchRun {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';
  startedAt: string;
  finishedAt: string | null;
  jobsFound: number;
  jobsNew: number;
  duplicatesSkipped: number;
  errors: { source: string; keyword?: string; error: string }[] | null;
  jobSearchProfile: { name: string } | null;
}

export interface DashboardData {
  name: string | null;
  totals: {
    jobsFound: number; todayNew: number; jobsAnalyzed: number; strongMatches: number; pendingReview: number;
    applicationsSent: number; interviews: number; offers: number; rejected: number;
  };
  today: { newJobs: number; strongMatches: number; pendingReview: number; applicationsSent: number };
  responseRate: number;
  lastRun: SearchRun | null;
  followUps: { due: number; items: { id: string; company: string; jobTitle: string; followUpDate: string }[] };
  topReview: { id: string; title: string; company: string; location: string | null; analysis: { finalMatchScore: number; recommendedCv: { name: string } | null } | null }[];
}

export interface Thresholds {
  poor: [number, number];
  possible: [number, number];
  good: [number, number];
  strong: [number, number];
  excellent: [number, number];
}

export interface Settings {
  match_score_thresholds: Thresholds;
  scheduler: { enabled: boolean; intervalHours: number; profileIds: string[]; sourceKeys: string[] };
  candidate: { name: string; email: string; phone: string };
  auto_apply: { enabled: boolean; minScore: number; dailyLimit: number };
  pipeline: { defaultMinScore: number; fetchDescriptions: boolean; maxDescriptionFetches: number };
  whatsapp_notify: { enabled: boolean; phone: string; minScore: number };
}

export type WhatsAppSessionStatus =
  | 'created' | 'initializing' | 'qr_ready' | 'authenticating' | 'ready' | 'disconnected' | 'action_required' | 'failed';

export interface WhatsAppStatus {
  configured: boolean;
  reachable: boolean;
  session: { status: WhatsAppSessionStatus; phone: string | null; pushName: string | null } | null;
}

export interface EmailStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  detail?: string;
}

export interface AiStatus {
  provider: string;
  model: string;
  ok: boolean;
  detail?: string;
}
