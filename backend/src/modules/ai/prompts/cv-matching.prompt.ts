export interface CvMatchPromptInput {
  title: string;
  description: string;
  options: { id: string; name: string; category: string; skills: string[] }[];
}

export const CV_MATCH_SYSTEM = 'You choose the best CV for a job. Respond with a single JSON object only.';

/** Used as a tie-breaker when deterministic CV scores are too close to call. */
export function buildCvMatchPrompt(i: CvMatchPromptInput): string {
  const opts = i.options.map((o) => `- id=${o.id} | ${o.name} | ${o.category} | skills: ${o.skills.join(', ')}`).join('\n');
  return `Pick the single best CV for this job.

Job title: ${i.title}
Description:
"""
${i.description.slice(0, 3000)}
"""

Options:
${opts}

Return JSON: {"cvId": "<one of the ids above>", "reason": "<one short sentence>"}`;
}
