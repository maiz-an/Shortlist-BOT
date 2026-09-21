import { similarity } from '../../common/utils/normalize';

export interface DedupeFields {
  normalizedCompany: string;
  normalizedTitle: string;
  normalizedLocation: string;
  canonicalUrl: string | null;
  description: string;
}

export type DuplicateReason = 'url' | 'company-title-location' | 'description-similarity';

function locationsCompatible(a: string, b: string): boolean {
  if (!a || !b) return true; // unknown location cannot disprove a match
  if (a === b) return true;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  return [...small].every((t) => big.has(t));
}

/** Decides whether two normalized jobs describe the same posting. */
export function detectDuplicate(a: DedupeFields, b: DedupeFields): DuplicateReason | null {
  if (a.canonicalUrl && a.canonicalUrl === b.canonicalUrl) return 'url';
  if (!a.normalizedCompany || a.normalizedCompany !== b.normalizedCompany) return null;
  if (!locationsCompatible(a.normalizedLocation, b.normalizedLocation)) return null;
  if (a.normalizedTitle === b.normalizedTitle) return 'company-title-location';
  if (
    similarity(a.normalizedTitle, b.normalizedTitle) >= 0.7 &&
    a.description.length > 200 &&
    b.description.length > 200 &&
    similarity(a.description, b.description) >= 0.85
  ) {
    return 'description-similarity';
  }
  return null;
}
