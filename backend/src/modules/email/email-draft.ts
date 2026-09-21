import { containsTerm } from '../../common/utils/normalize';
import { toPlainText } from '../../common/utils/sanitize';

/** Returns the forbidden skills (skills the CV lacks) that the email body claims. */
export function findForbiddenClaims(body: string, forbidden: string[]): string[] {
  return forbidden.filter((s) => containsTerm(body, s));
}

export function cleanEmailText(s: string): string {
  return toPlainText(s).replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
}

/**
 * Deterministic draft built only from stored facts (used when the model is unavailable or keeps
 * producing unusable output). It cannot invent anything because it only echoes CV/analysis data.
 */
export function buildFallbackEmail(i: {
  jobTitle: string; company: string; candidateName: string; cvName: string; matchedSkills: string[]; yearsExperience: number | null;
}): { subject: string; body: string } {
  const skills = i.matchedSkills.slice(0, 4);
  const lines = [
    `Dear ${i.company} Hiring Team,`,
    '',
    `I would like to apply for the ${i.jobTitle} position at ${i.company}.`,
    i.yearsExperience ? `I bring ${i.yearsExperience} years of relevant experience.` : '',
    skills.length ? `My background includes ${skills.join(', ')}, which matches the requirements of this role.` : '',
    `Please find my CV (${i.cvName}) attached. I would welcome the chance to discuss how I can contribute.`,
    '',
    'Kind regards,',
    i.candidateName,
  ];
  return { subject: `Application for ${i.jobTitle}`, body: lines.filter((l, idx) => l !== '' || lines[idx - 1] !== '').join('\n').trim() };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
