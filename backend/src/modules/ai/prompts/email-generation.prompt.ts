import type { EmailAngle } from '../schemas';

export interface EmailPromptInput {
  jobTitle: string;
  company: string;
  description: string;
  /** Everything about the candidate comes from the selected CV; only name and phone come from Settings. */
  cv: { name: string; skills: string[]; years: number | null; summary: string; experience: string };
  candidate: { name: string; phone: string };
  matchedSkills: string[];
  /** Skills the job wants that the CV does not list - the email must never claim these. */
  forbiddenSkills: string[];
  /** The single strongest true match between ad and CV, found in a first step. */
  angle?: EmailAngle | null;
  /** Worked-out note about a seniority gap (empty when there is none). */
  gap?: string;
  /** The sentence to end on; varies from job to job. */
  closer?: string;
  /** Employer to name in the email (the one the evidence line belongs to). */
  employer?: string | null;
  /** How to open; varies from job to job. */
  opener?: string;
}

export const EMAIL_SYSTEM =
  'You write job application emails the way a sharp, friendly person writes them: short, plain, specific to the job. ' +
  'You never sound like a template or an AI. Respond with a single JSON object only.';

/** Words and phrases that make an email read as machine-written or padded. Also enforced in code. */
export const AI_TELLS = [
  'i am writing to', "i'm writing to", 'i am excited', "i'm excited", 'i am thrilled', 'thrilled', 'delighted', 'eager to', 'keen',
  'passionate', 'highly motivated', 'dynamic', 'proven track record', 'track record', 'leverage', 'seamless', 'synergy',
  'cutting-edge', 'state-of-the-art', 'innovative', 'results-driven', 'detail-oriented', 'team player', 'fast learner',
  'perfect fit', 'ideal candidate', 'valuable asset', 'contribute to your team', 'i believe', 'well-suited', 'testament',
  'in today', 'fast-paced', 'aligns with', 'align with', 'i am confident', 'unique blend', 'spearhead', 'robust', 'holistic',
  'tapestry', 'delve', 'dear sir', 'to whom it may concern', 'esteemed', 'opportunity to bring', 'look forward to hearing',
  'glad to talk any time', 'step up', 'you need someone to', "that's the job",
];

export function buildEmailPrompt(i: EmailPromptInput): string {
  const a = i.angle;
  const angle = a
    ? `THE ANGLE (build the email around this and nothing else)
- The ad asks for: ${a.requirement}
- The CV proves it: ${a.evidence}
- Concrete detail to use: ${a.detail || '(none, use the CV line above)'}
- Employer to name: ${i.employer ?? 'the employer this work was done for on the CV'}
- Strength of fit: ${a.fit}${a.fit === 'WEAK' ? ' (be honest and brief: say what related work you have, do not stretch it)' : ''}`
    : 'THE ANGLE: pick the one thing in the ad that the CV work experience really shows, and build the email around it.';

  return `Write a short, specific job application email.

JOB: ${i.jobTitle} at ${i.company}
Job description:
"""
${i.description.slice(0, 3000)}
"""

CANDIDATE (facts below come from the candidate's CV, and are the ONLY facts you may use)
Name: ${i.candidate.name || '(none - sign off with just "Thanks")'}
Years of work experience (from CV dates): ${i.cv.years ?? 'not clear'}
CV work experience:
"""
${i.cv.experience || 'none'}
"""
Skills on the CV: ${i.cv.skills.join(', ') || 'none listed'}
Do NOT claim or mention: ${i.forbiddenSkills.join(', ') || 'nothing'}

${angle}
${i.gap ? `\nSENIORITY GAP: ${i.gap}\n` : ''}
HOW TO WRITE IT
- 60 to 100 words in the body. Plain text, no lists, no markdown, no bold.
- Start with "Hi ${i.company} team," (or "Hello," if the company name looks odd). Put the role you are applying for in the first sentence.
- ${i.opener ?? "Open with the role, then say how the CV meets the ad's main need."} Name the real employer or project and the concrete detail from THE ANGLE. Say what was built or done, not just a list of tools. Speak to this job: the reader should see you read their ad.
- Use the years of experience only as the number given above.
- ${i.closer ? `End with this closing line, lightly adapted if needed: "${i.closer}"` : 'End with one short closing line that mentions the CV is attached.'} Then "Thanks," and the name.
- Write like you talk: short sentences, contractions (I'm, I've), everyday words.
- Do not use em dashes, flattery, or adjectives about yourself (no "passionate", "motivated", "dedicated", "excited", "keen", "expert").
- Do not say "managed", "led", "owned", "architected" or "senior" about yourself unless the CV work experience uses that exact idea. Say "worked on", "built", "supported", "took part in" instead.
- Never invent employers, company types, dates, degrees, numbers or achievements. If a fact is not above, leave it out.

Return JSON: {"subject": "<${i.jobTitle} application${i.candidate.name ? ` - ${i.candidate.name}` : ''}>", "body": "<email body>"}`;
}
