import { z } from 'zod';

/**
 * Small models often return a list as one comma-separated string, "None", or an over-long entry.
 * Repair exactly those slips; anything else that is not a list of strings still fails validation.
 */
export function toSkillList(v: unknown): unknown {
  if (v === null || v === undefined) return [];
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : v;
  if (!Array.isArray(raw)) return v;
  return raw
    .map((x) => (typeof x === 'string' ? x.trim() : x))
    .filter((x) => x !== '' && !(typeof x === 'string' && /^(none|n\/a|na|nil|null|no missing skills?)\.?$/i.test(x)))
    .map((x) => (typeof x === 'string' ? x.slice(0, 80) : x))
    .slice(0, 50);
}

const strList = z.preprocess(toSkillList, z.array(z.string().min(1).max(80)).max(50));
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

export const jobAnalysisSchema = z.object({
  category: z.string().trim().min(1).max(40).transform((v) => v.toUpperCase().replace(/[\s-]+/g, '_')),
  matchScore: z.coerce.number().min(0).max(100).transform((n) => Math.round(n)),
  recommendedCvId: z.string().nullable().optional().transform((v) => v ?? null),
  matchedSkills: strList,
  missingSkills: strList,
  experienceRequired: z.string().max(80).nullable().optional().transform((v) => v ?? null),
  experienceCompatible: bool,
  locationCompatible: bool,
  salaryMentioned: bool.default(false),
  applicationMethod: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(['EMAIL', 'WEBSITE', 'UNKNOWN'])),
  recommendation: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(['APPLY', 'MAYBE', 'SKIP'])),
  reason: z.string().max(500).default(''),
});
export type JobAnalysisOutput = z.infer<typeof jobAnalysisSchema>;

export const cvMatchSchema = z.object({ cvId: z.string(), reason: z.string().max(300).optional() });

export const emailSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(40).max(4000),
});
export type EmailOutput = z.infer<typeof emailSchema>;

/** The one strongest honest match between a job ad and the CV; the email is written around it. */
export const angleSchema = z.object({
  requirement: z.string().trim().min(3).max(200),
  evidence: z.string().trim().min(5).max(400),
  detail: z.string().trim().max(300).default(''),
  fit: z.enum(['STRONG', 'PARTIAL', 'WEAK']),
});
export type EmailAngle = z.infer<typeof angleSchema>;
