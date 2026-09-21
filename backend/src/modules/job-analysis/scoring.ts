import { JobType } from '@prisma/client';
import { containsTerm } from '../../common/utils/normalize';
import { Thresholds } from '../settings/settings.service';
import { cleanMissingSkills } from './skill-text';

export interface ScoreInput {
  job: { title: string; description: string; location?: string | null; jobType?: JobType | null };
  cv: { skills: string[]; preferredJobKeywords: string[]; excludedKeywords: string[] } | null;
  constraints: { excludedKeywords: string[]; preferredJobTypes: JobType[]; preferredLocations: string[]; keywords: string[] };
  ai: { matchScore: number; missingSkills: string[]; experienceCompatible: boolean; locationCompatible: boolean };
  candidateYears: number | null;
  /** 0..1 relevance of the selected CV to the job (see cv-selection). */
  cvRelevance: number;
}

export interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
  matchedSkills: string[];
  missingSkills: string[];
  excludedHits: string[];
  experienceRequiredYears: number | null;
  experienceCompatible: boolean;
  locationCompatible: boolean;
}

export const WEIGHTS = { skills: 35, title: 20, experience: 10, location: 10, employmentType: 5, cvRelevance: 10, ai: 10 } as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Highest minimum-years requirement mentioned near the word "experience" (e.g. "3+ years", "2-4 years"). */
export function parseRequiredYears(text: string): number | null {
  let max: number | null = null;
  const re = /(\d{1,2})\s*(?:\+|-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b[^.\n]{0,40}?experience|experience[^.\n]{0,30}?(\d{1,2})\s*(?:\+|-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1] ?? m[2]);
    if (n >= 0 && n <= 40) max = max === null ? n : Math.max(max, n);
  }
  return max;
}

function titleMatch(title: string, keywords: string[]): number {
  const words = new Set(title.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean));
  let best = 0;
  for (const k of keywords) {
    if (!k.trim()) continue;
    if (containsTerm(title, k)) return 1;
    const kw = k.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
    if (kw.length) best = Math.max(best, kw.filter((w) => words.has(w)).length / kw.length);
  }
  return best;
}

export function calculateScore(i: ScoreInput): ScoreResult {
  const text = `${i.job.title}\n${i.job.description}`;
  const cvSkills = i.cv?.skills ?? [];
  const matchedSkills = cvSkills.filter((s) => containsTerm(text, s));
  // Missing skills: only what the ad really mentions, not already on the CV, no filler, no duplicates.
  const missingSkills = cleanMissingSkills(i.ai.missingSkills, cvSkills, text);

  // With very few named skills the ratio is unreliable (1 of 1 would be a free 100%), so pull it toward neutral.
  const evidence = matchedSkills.length + missingSkills.length;
  const pseudo = Math.max(0, 4 - evidence);
  const skills = !i.cv ? 0 : evidence === 0 ? 0.5 : (matchedSkills.length + 0.5 * pseudo) / (evidence + pseudo);

  const title = titleMatch(i.job.title, [...i.constraints.keywords, ...(i.cv?.preferredJobKeywords ?? [])]);

  const requiredYears = parseRequiredYears(i.job.description);
  let experienceCompatible = i.ai.experienceCompatible;
  let experience = i.ai.experienceCompatible ? 1 : 0.3;
  if (requiredYears !== null && i.candidateYears !== null) {
    const gap = requiredYears - i.candidateYears;
    experienceCompatible = gap <= 0;                         // even one year short is a stretch, not a fit
    experience = gap <= 0 ? 1 : Math.max(0.1, 1 - 0.4 * gap); // 1 yr short = 0.6, 2 = 0.2
  }

  let locationCompatible = i.ai.locationCompatible;
  let location = i.ai.locationCompatible ? 1 : 0.2;
  if (i.constraints.preferredLocations.length) {
    const loc = `${i.job.location ?? ''} ${/\bremote\b/i.test(text) ? 'remote' : ''}`;
    locationCompatible = i.constraints.preferredLocations.some((p) => containsTerm(loc, p)) || /\bremote\b/i.test(loc);
    location = locationCompatible ? 1 : 0;
  }

  const type = i.job.jobType && i.job.jobType !== 'UNKNOWN' ? i.job.jobType : null;
  const employmentType = !i.constraints.preferredJobTypes.length || !type ? 0.6 : i.constraints.preferredJobTypes.includes(type) ? 1 : 0;

  const excluded = [...i.constraints.excludedKeywords, ...(i.cv?.excludedKeywords ?? [])].filter(Boolean);
  const excludedHits = [...new Set(excluded.filter((k) => containsTerm(text, k)))];
  const titleHit = excluded.some((k) => containsTerm(i.job.title, k));
  const penalty = excludedHits.length ? (titleHit ? 50 : 25) : 0;

  const breakdown = {
    skills: skills * WEIGHTS.skills,
    title: title * WEIGHTS.title,
    experience: experience * WEIGHTS.experience,
    location: location * WEIGHTS.location,
    employmentType: employmentType * WEIGHTS.employmentType,
    cvRelevance: (i.cv ? clamp01(i.cvRelevance) : 0) * WEIGHTS.cvRelevance,
    ai: (i.ai.matchScore / 100) * WEIGHTS.ai,
    excludedPenalty: -penalty,
  };
  const round = Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  const score = Math.max(0, Math.min(100, Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0))));

  return { score, breakdown: round, matchedSkills, missingSkills, excludedHits, experienceRequiredYears: requiredYears, experienceCompatible, locationCompatible };
}

export type ScoreLabel = 'poor' | 'possible' | 'good' | 'strong' | 'excellent';

export function scoreLabel(score: number, t: Thresholds): ScoreLabel {
  for (const k of ['excellent', 'strong', 'good', 'possible'] as const) if (score >= t[k][0]) return k;
  return 'poor';
}

/** Recommendation is derived from the score (not the LLM): APPLY at "good"+, MAYBE at "possible". */
export function recommendationFor(
  score: number,
  t: Thresholds,
  excludedHits: string[],
  ai?: { recommendation: string },
): 'APPLY' | 'MAYBE' | 'SKIP' {
  if (excludedHits.length && score < t.strong[0]) return 'SKIP';
  // The model strongly advised against it: never an automatic APPLY, a person should look first.
  if (score >= t.good[0]) return ai?.recommendation === 'SKIP' ? 'MAYBE' : 'APPLY';
  if (score >= t.possible[0]) return 'MAYBE';
  return 'SKIP';
}
