import { containsTerm } from '../../common/utils/normalize';
import { toPlainText } from '../../common/utils/sanitize';
import { AI_TELLS } from '../ai/prompts/email-generation.prompt';

/** Returns the forbidden skills (skills the CV lacks) that the email body claims. */
export function findForbiddenClaims(body: string, forbidden: string[]): string[] {
  return forbidden.filter((s) => containsTerm(body, s));
}

export function cleanEmailText(s: string): string {
  // Em dashes are a giveaway of machine writing; a plain hyphen or comma reads more human.
  return toPlainText(s).replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/\s*[—–]\s*/g, ', ').replace(/[ \t]+\n/g, '\n');
}

export const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Stock phrases that make an email sound machine-written or padded. */
export function findAiTells(text: string): string[] {
  const t = text.toLowerCase().replace(/[‘’]/g, "'");
  return AI_TELLS.filter((p) => new RegExp(`(^|[^a-z])${escapeRe(p)}`).test(t));
}

/**
 * Technical terms (acronyms like SIEM, names like NestJS or PostgreSQL) that the email uses but that appear
 * nowhere in the CV text or skills. These are treated as invented and the draft is rejected.
 */
export function findUngrounded(body: string, allowedText: string): string[] {
  const allowed = allowedText.toLowerCase();
  const terms = body.match(/\b(?:[A-Z]{2,}[a-z]?|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*)\b/g) ?? [];
  const skip = new Set(['cv', 'i', 'ok']);
  return [...new Set(terms)].filter((t) => !skip.has(t.toLowerCase()) && !allowed.includes(t.toLowerCase()));
}

/**
 * Real names an email can point to: employers ("Unitrac | IT Support" -> "unitrac") and named projects
 * ("MO Marketplace (mo.lk)" -> "mo marketplace"), read from the CV work experience.
 */
export function experienceAnchors(experience: string): string[] {
  const out = new Set<string>();
  for (const line of experience.split('\n')) {
    const m = line.match(/^\s*([^|()]{3,60}?)\s*(?:\(.*?\))?\s*\|/);
    if (m) out.add(m[1].trim().split(/\s+/)[0].toLowerCase());
  }
  for (const m of experience.matchAll(/\b((?:[A-Z][\w.]*\s){0,2}[A-Z][\w.]*)\s*\(/g)) if (m[1].length >= 4) out.add(m[1].toLowerCase());
  return [...out].filter((a) => a.length >= 3);
}

/** The employer whose block of the CV work experience contains the quoted evidence line. */
export function employerFor(experience: string, evidence: string): string | null {
  let employer: string | null = null;
  for (const line of experience.split('\n')) {
    const m = line.match(/^\s*([^|]{3,80}?)\s*\|/);
    if (m) { employer = m[1].replace(/\s*\(.*?\)\s*/g, ' ').trim(); if (mostlyIn(evidence, line, 0.7)) return employer; continue; }
    if (employer && mostlyIn(evidence, line, 0.7)) return employer;
  }
  return null;
}

/** Figures and counts in the email (24x7, 40%, 10 users) that appear nowhere in the CV or the allowed facts. */
export function findUngroundedNumbers(body: string, allowedText: string): string[] {
  const allowed = allowedText.toLowerCase();
  const nums = body.match(/\b\d[\d.,]*(?:x\d+|\+|%|k|m)?/gi) ?? [];
  return [...new Set(nums.map((n) => n.replace(/[.,]+$/, '')))].filter((n) => {
    const core = n.toLowerCase().replace(/\+$/, '');
    return !new RegExp(`(^|[^a-z0-9.])${escapeRe(core)}($|[^a-z0-9])`).test(allowed);
  });
}

/** What is wrong with a draft, in plain words for the retry prompt; empty when it is good. */
export function draftProblems(body: string): string {
  const words = wordCount(body);
  const problems: string[] = [];
  if (words > 110) problems.push(`it has ${words} words; keep the body between 50 and 90 words`);
  if (words < 35) problems.push('it is too short to say anything useful');
  const tells = findAiTells(body);
  if (tells.length) problems.push(`it uses stock phrases (${tells.join(', ')}); say it in plain everyday words instead`);
  return problems.join('; ');
}

/**
 * Deterministic draft built only from stored facts (used when the model is unavailable or keeps
 * producing unusable output). It cannot invent anything because it only echoes CV/analysis data.
 */
export function buildFallbackEmail(i: {
  jobTitle: string; company: string; candidateName: string; cvName: string; matchedSkills: string[]; yearsExperience: number | null;
  /** A real line from the CV and the employer it belongs to; used when it reads naturally after "At <employer>, I". */
  evidence?: { employer: string; line: string } | null;
}): { subject: string; body: string } {
  const skills = i.matchedSkills.slice(0, 3);
  const list = skills.length > 1 ? `${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]}` : skills[0];
  const years = i.yearsExperience ? `${i.yearsExperience} years` : '';
  const line = i.evidence?.line.replace(/[.\s]+$/, '') ?? '';
  const fromCv = i.evidence?.employer && /^[A-Z][a-z]+ed\b/.test(line)
    ? `At ${i.evidence.employer}, I ${line.charAt(0).toLowerCase()}${line.slice(1)}.` : '';
  const middle =
    fromCv ? fromCv
    : list && years ? `I've spent ${years} working with ${list}, which is what this role needs.`
    : list ? `I work with ${list}, which is what this role needs.`
    : years ? `I bring ${years} of hands-on experience.` : '';
  const lines = [
    `Hi ${i.company} team,`,
    '',
    `I'm applying for the ${i.jobTitle} role.${middle ? ` ${middle}` : ''}`,
    '',
    'My CV is attached. Happy to talk whenever suits you.',
    '',
    'Thanks,',
    i.candidateName,
  ];
  const subject = i.candidateName ? `${i.jobTitle} application - ${i.candidateName}` : `${i.jobTitle} application`;
  return { subject, body: lines.join('\n').trim() };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9+#.]{3,}/g) ?? []).map((w) => w.replace(/\.+$/, '')).filter((w) => w.length >= 3);

/** True when at least `min` of the words in `claim` occur in `source` (used to confirm a quote really is from the CV). */
export function mostlyIn(claim: string, source: string, min = 0.7): boolean {
  const w = words(claim);
  if (!w.length) return false;
  const src = new Set(words(source));
  return w.filter((x) => src.has(x)).length / w.length >= min;
}

/** Leadership and seniority words the email may only use when the CV itself uses them. [word in email, word that must be on the CV] */
const OVERCLAIMS: [RegExp, RegExp][] = [
  [/\b(manag(?:ed|ing)|managed)\b/i, /manag/i],
  [/\b(led|leading|lead)\b/i, /\b(led|leading|lead)\b/i],
  [/\b(owned|ownership)\b/i, /\bown(?:ed|ership)\b/i],
  [/\b(architect(?:ed|ing)?)\b/i, /architect/i],
  [/\b(oversaw|oversee|overseeing|supervis(?:ed|ing))\b/i, /oversaw|oversee|supervis/i],
  [/\b(mentor(?:ed|ing)?)\b/i, /mentor/i],
  [/\b(spearhead(?:ed)?|headed|directed)\b/i, /spearhead|headed|directed/i],
  [/\b(expert|expertise|extensive|senior)\b/i, /\b(expert|expertise|extensive|senior)\b/i],
];

/** Words in the email that make the candidate sound more senior than the CV says. */
export function findOverclaims(body: string, cvText: string, jobTitle = ''): string[] {
  // The job's own title ("Senior Backend Engineer") may be quoted; that is not a claim about the candidate.
  const text = jobTitle ? body.split(jobTitle).join(' ') : body;
  const out: string[] = [];
  for (const [inEmail, inCv] of OVERCLAIMS) {
    const m = text.match(inEmail);
    if (m && !inCv.test(cvText)) out.push(m[0].toLowerCase());
  }
  return out;
}

/** Different endings so a run of emails does not look copy-pasted. Chosen from a stable seed (the job id). */
const CLOSERS = [
  'CV attached, and I am happy to walk you through any of it.',
  "CV attached. If a quick call would help, I'm free whenever suits you.",
  "I've attached my CV. Let me know what else would be useful.",
  "CV attached. Happy to answer anything you'd like to know.",
  "My CV is attached. I can talk this week if that works.",
  "CV attached. Tell me a time that suits you and I'll be there.",
];
export function pickCloser(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CLOSERS[h % CLOSERS.length];
}

const hashOf = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/** How to say "I'm a bit short of the years asked" - several wordings so emails do not repeat each other. */
const GAP_WORDINGS = [
  (y: number, r: number) => `"I have about ${y} years, a bit under the ${r}+ you ask for, so I'd rather be upfront about it."`,
  (y: number, r: number) => `"I'll be upfront: I have about ${y} years, not ${r}+."`,
  (y: number, r: number) => `"You ask for ${r}+ years and I have about ${y}, but the work itself is what I do every day."`,
  (y: number, r: number) => `"On years I'm a little short of ${r}+ (about ${y}), though the hands-on work matches."`,
];

/** What to say about the seniority gap, worked out from numbers (never left to the model). Empty when there is none. */
export function gapNote(requiredYears: number | null, cvYears: number | null, seed = ''): string {
  if (requiredYears === null || cvYears === null || requiredYears <= cvYears) return '';
  const wording = GAP_WORDINGS[hashOf(`${seed}gap`) % GAP_WORDINGS.length](cvYears, requiredYears);
  return `The ad asks for ${requiredYears}+ years and the CV shows about ${cvYears}. Say so once, honestly and calmly, in your own words. A wording to adapt: ${wording} Do not hide it, do not apologise, and do not use the phrase "step up".`;
}

/** Different ways to open, so a run of emails does not share one shape. Picked from a stable seed (the job id). */
const OPENERS = [
  'Open with what the ad needs, in your own words, then show that you have done exactly that.',
  'Open with the role in one sentence, then go straight to the most relevant thing you built or did, and end that paragraph by tying it to what the ad needs.',
  'Open with the role, then name the real employer and what you did there that matches the ad best.',
];
export const pickOpener = (seed: string): string => OPENERS[hashOf(`${seed}open`) % OPENERS.length];

/**
 * Puts the email into its proper shape (greeting, one or two short paragraphs, closing line, sign-off),
 * whatever line breaks the model used. It only moves text; it never adds or removes words of the message.
 */
export function formatEmail(body: string): string {
  let t = body.replace(/\s+/g, ' ').trim();
  // Company names may contain a comma ("McDermott International, Ltd team,"), so look for "team," first.
  const greeting = t.match(/^((?:hi|hello|hey)\b.{0,80}?\bteam,)\s*/i) ?? t.match(/^((?:hi|hello|hey)\b[^,]{0,60},)\s*/i);
  if (greeting) t = t.slice(greeting[0].length);
  const sign = t.match(/\s*\b(thanks|thank you|kind regards|best regards|regards|best|cheers)\s*,?\s+([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})\s*$/i);
  if (sign) t = t.slice(0, sign.index).trim();
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const at = sentences.findIndex((x) => /\b(cv|resume|résumé|attached|attach)\b/i.test(x));
  const main = (at === -1 ? sentences : sentences.slice(0, at)).join(' ');
  const closing = at === -1 ? '' : sentences.slice(at).join(' ');
  const parts = [greeting?.[1], main, closing, sign ? `${sign[1].replace(/^./, (c) => c.toUpperCase())},\n${sign[2]}` : ''].filter(Boolean);
  return parts.join('\n\n');
}
