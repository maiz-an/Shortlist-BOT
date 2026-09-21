export interface AnalysisPromptInput {
  title: string;
  company: string;
  location?: string | null;
  description: string;
  cvs: { id: string; name: string; category: string; skills: string[] }[];
  candidate: { yearsExperience: number | null; preferredLocations: string[] };
}

export const JOB_ANALYSIS_SYSTEM =
  'You are a precise recruiting analyst. Respond with a single JSON object only. No prose, no markdown.';

export function buildJobAnalysisPrompt(i: AnalysisPromptInput): string {
  const cvs = i.cvs.map((c) => `- id=${c.id} | ${c.name} | category=${c.category} | skills: ${c.skills.join(', ') || 'n/a'}`).join('\n');
  return `Analyze this job against the candidate's CV profiles.

JOB
Title: ${i.title}
Company: ${i.company}
Location: ${i.location ?? 'unknown'}
Description:
"""
${i.description.slice(0, 6000)}
"""

CANDIDATE
Years of experience: ${i.candidate.yearsExperience ?? 'unknown'}
Preferred locations: ${i.candidate.preferredLocations.join(', ') || 'any'}
CV profiles:
${cvs || '(none)'}

Return JSON with exactly these keys:
{
  "category": "FULL_STACK | FRONTEND | BACKEND | IT_SUPPORT | SYSADMIN | DEVOPS | DATA | OTHER_IT | NON_IT",
  "matchScore": integer 0-100 (overall fit),
  "recommendedCvId": one of the CV ids above, or null,
  "matchedSkills": skills required by the job that the recommended CV lists,
  "missingSkills": skills required by the job that the recommended CV does NOT list,
  "experienceRequired": string like "2-4 years" or null,
  "experienceCompatible": boolean,
  "locationCompatible": boolean,
  "salaryMentioned": boolean,
  "applicationMethod": "EMAIL | WEBSITE | UNKNOWN",
  "recommendation": "APPLY | MAYBE | SKIP",
  "reason": one short sentence
}
Only list skills that are actually mentioned in the job description. Never invent skills.`;
}
