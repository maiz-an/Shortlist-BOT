export interface AnglePromptInput {
  jobTitle: string;
  company: string;
  description: string;
  cvExperience: string;
  cvSkills: string[];
}

export const ANGLE_SYSTEM = 'You are a careful recruiter. Respond with a single JSON object only.';

/** Step 1 of writing an email: find the single best true connection between the ad and the CV. */
export function buildAnglePrompt(i: AnglePromptInput): string {
  return `Find the single strongest HONEST match between this job ad and this candidate's CV.

JOB: ${i.jobTitle} at ${i.company}
"""
${i.description.slice(0, 3500)}
"""

CV WORK EXPERIENCE
"""
${i.cvExperience}
"""
CV skills: ${i.cvSkills.join(', ') || 'none listed'}

Pick ONE thing the ad asks for that the CV really shows. Prefer the ad's main duty over a minor tool.
Return JSON:
{
  "requirement": "what the ad asks for, in a few words taken from the ad",
  "evidence": "the CV sentence or line that proves it, copied word for word from the CV work experience above",
  "detail": "one concrete thing from that CV line worth saying: what was built or done, for whom, with what tool (only from the CV)",
  "fit": "STRONG if the CV clearly does this work, PARTIAL if it is related, WEAK if nothing really matches"
}
Never invent anything. If nothing matches, use fit WEAK and give the closest real experience as the evidence.`;
}
