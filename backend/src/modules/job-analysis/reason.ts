export interface ReasonInput {
  score: number;
  recommendation: 'APPLY' | 'MAYBE' | 'SKIP';
  hasCv: boolean;
  matched: string[];
  missing: string[];
  requiredYears: number | null;
  candidateYears: number | null;
  experienceCompatible: boolean;
  locationCompatible: boolean;
  excludedHits: string[];
  ai: { recommendation: string; matchScore: number; reason: string };
}

const list = (items: string[], n = 4) => items.slice(0, n).join(', ') + (items.length > n ? ` +${items.length - n} more` : '');

/**
 * One plain-language explanation built from the numbers the backend actually used,
 * so the text can never contradict the score. If the AI disagreed, that is said out loud.
 */
export function buildReason(i: ReasonInput): string {
  const parts: string[] = [];
  if (!i.hasCv) parts.push('No enabled CV profile was available to compare against.');
  parts.push(i.matched.length ? `Matches ${i.matched.length} of your skills (${list(i.matched)}).` : 'None of your listed skills are named in the ad.');
  if (i.missing.length) parts.push(`Gaps: ${list(i.missing)}.`);
  if (i.requiredYears !== null) {
    parts.push(
      i.experienceCompatible
        ? `Asks for ${i.requiredYears}+ years, which fits your experience.`
        : `Asks for ${i.requiredYears}+ years${i.candidateYears !== null ? `; you have ${i.candidateYears}` : ''}.`,
    );
  } else if (!i.experienceCompatible) {
    parts.push('The experience level may be above yours.');
  }
  if (!i.locationCompatible) parts.push('The location may not fit your preferences.');
  if (i.excludedHits.length) parts.push(`Contains excluded keyword(s): ${i.excludedHits.join(', ')}.`);

  const aiCautious = i.ai.recommendation === 'SKIP' || i.ai.matchScore <= i.score - 10;
  const note = i.ai.reason?.trim();
  if (aiCautious && i.recommendation !== 'SKIP') {
    parts.push(`The AI was more cautious (${i.ai.matchScore}%, "${i.ai.recommendation.toLowerCase()}")${note ? `: ${note}` : '.'} Please read the ad before applying.`);
  } else if (note) {
    parts.push(`AI note: ${note}`);
  }
  return parts.join(' ');
}
