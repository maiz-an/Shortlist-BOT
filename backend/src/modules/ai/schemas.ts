import { z } from 'zod';

const strList = z.array(z.string().trim().min(1).max(80)).max(50).default([]);
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
