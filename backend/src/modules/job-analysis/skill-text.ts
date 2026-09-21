import { containsTerm } from '../../common/utils/normalize';

/** Words that add no meaning when comparing skills ("Docker skills" vs "Docker"). */
const FILLER = /\b(skills?|tools?|experience|knowledge|ability|abilities|principles|technologies|technology|ceremonies|proficiency|expertise|understanding|certifications?)\b/g;

/** Soft or process phrases that are not checkable skills; showing them as "missing" is just noise. */
const VAGUE = /^(code reviews?|project planning|communication|teamwork|collaboration|problem solving|analytical|attention to detail|time management|best practices|performance bottlenecks|team player|fast learner|self starter)$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normSkill(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(FILLER, ' ')
    .replace(/[^a-z0-9+#./ &-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Agile/Scrum ceremonies" -> ["agile/scrum", "agile", "scrum"]. */
export function skillParts(s: string): string[] {
  const n = normSkill(s);
  const split = n.split(/\s*(?:\/|,|&|\band\b|\bor\b)\s*/).map((x) => x.trim()).filter((x) => x.length >= 2);
  return [...new Set([n, ...split])].filter(Boolean);
}

function wholeWord(haystack: string, needle: string): boolean {
  return !!needle && new RegExp(`(^|[^a-z0-9])${escape(needle)}($|[^a-z0-9])`).test(haystack);
}

/** True when the ad really talks about this skill, even if worded a little differently ("SLA tracking" vs "SLA"). */
export function mentionedInText(text: string, skill: string): boolean {
  if (containsTerm(text, skill)) return true;
  if (skillParts(skill).some((p) => p.length >= 3 && containsTerm(text, p))) return true;
  // A shared acronym (SLA, ITIL, CCNA, ...) is strong evidence on its own.
  if ((skill.match(/\b[A-Z][A-Z0-9+#]{1,}\b/g) ?? []).some((a) => containsTerm(text, a))) return true;
  const tokens = normSkill(skill).split(/[ /&,]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  return tokens.filter((t) => containsTerm(text, t)).length / tokens.length >= 0.6;
}

/** True when the candidate's CV already lists this skill (or something more general that contains it). */
export function coveredByCv(skill: string, cvSkills: string[]): boolean {
  const cv = cvSkills.map(normSkill).filter(Boolean);
  return skillParts(skill).some((p) => cv.some((c) => p === c || wholeWord(p, c) || wholeWord(c, p)));
}

/**
 * Turns the model's raw "missing skills" into an honest, readable list:
 * only skills the ad really mentions, not already on the CV, no vague filler, no duplicates, at most `max`.
 */
export function cleanMissingSkills(missing: string[], cvSkills: string[], jobText: string, max = 12): string[] {
  const out: string[] = [];
  const seen: string[] = [];
  for (const raw of missing) {
    const s = raw.trim();
    const n = normSkill(s);
    if (s.length < 2 || !n || VAGUE.test(n)) continue;
    if (!mentionedInText(jobText, s)) continue;
    if (coveredByCv(s, cvSkills)) continue;
    if (seen.some((x) => wholeWord(n, x) || wholeWord(x, n))) continue;
    seen.push(n);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
