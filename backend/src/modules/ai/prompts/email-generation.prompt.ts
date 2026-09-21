export interface EmailPromptInput {
  jobTitle: string;
  company: string;
  description: string;
  cv: { name: string; skills: string[] };
  candidate: { name: string; phone: string; yearsExperience: number | null; summary: string; experience: string };
  matchedSkills: string[];
  /** Skills the job wants that the CV does not list - the email must never claim these. */
  forbiddenSkills: string[];
}

export const EMAIL_SYSTEM =
  'You write short, natural job application emails for a real person. Respond with a single JSON object only.';

export function buildEmailPrompt(i: EmailPromptInput): string {
  return `Write a job application email.

JOB: ${i.jobTitle} at ${i.company}
Job description:
"""
${i.description.slice(0, 3500)}
"""

CANDIDATE
Name: ${i.candidate.name || '(use no name placeholder; sign off with "Kind regards")'}
Years of experience: ${i.candidate.yearsExperience ?? 'not stated'}
Summary: ${i.candidate.summary || 'not provided'}
Experience notes: ${i.candidate.experience || 'not provided'}
Selected CV: ${i.cv.name}
Skills listed on the CV (the ONLY skills you may claim): ${i.cv.skills.join(', ') || 'none listed'}
Skills relevant to this job that the CV covers: ${i.matchedSkills.join(', ') || 'none'}
Do NOT claim or mention these skills: ${i.forbiddenSkills.join(', ') || 'none'}

RULES
- 90-160 words, professional and direct, plain text, no markdown, no bullet lists.
- Mention 2-3 relevant skills or experience points naturally, only from the data above.
- Never invent employers, years, degrees, certifications or achievements.
- Do not use filler such as "I am writing to express my keen interest" or "passionate".
- Say the CV is attached. Close with a short sign-off using the candidate's name if given.

Return JSON: {"subject": "<concise subject including the job title>", "body": "<email body>"}`;
}
