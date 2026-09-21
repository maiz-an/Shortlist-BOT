const COMPANY_SUFFIXES = new Set([
  'llc', 'ltd', 'limited', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'wll', 'qpsc',
  'qsc', 'pjsc', 'fzco', 'fze', 'gmbh', 'plc', 'group', 'holding', 'holdings',
]);

function base(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s+#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCompany(s: string): string {
  return base(s.replace(/\./g, ''))
    .split(' ')
    .filter((t) => t && !COMPANY_SUFFIXES.has(t))
    .join(' ');
}

export function normalizeTitle(s: string): string {
  return base(s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(m\/f\/d|m\/w\/d|f\/m)\b/gi, ' '))
    .replace(/\b(urgent|urgently|hiring|required|needed|immediate|vacancy)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(s?: string | null): string {
  if (!s) return '';
  const seen = new Set<string>();
  for (const t of base(s).split(' ')) if (t) seen.add(t);
  return [...seen].join(' ');
}

/** Strip tracking query params/fragments so the same posting matches across runs. */
export function canonicalUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function tokens(s: string): Set<string> {
  return new Set(base(s).split(' ').filter((t) => t.length > 2));
}

/** Jaccard similarity over word tokens (0..1). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function extractEmail(text: string): string | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

/** Whole-word (or phrase) case-insensitive containment; safe for terms like C++ or .NET. */
export function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}
