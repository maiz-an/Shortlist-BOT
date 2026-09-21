import * as path from 'path';

/** Reads the plain text out of a CV file. Old .doc files cannot be read, so they return ''. */
export async function extractCvText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();
  try {
    if (ext === '.docx') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as { extractRawText(i: { buffer: Buffer }): Promise<{ value: string }> };
      return tidy((await mammoth.extractRawText({ buffer })).value);
    }
    if (ext === '.pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdf = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
      return tidy((await pdf(buffer)).text);
    }
  } catch {
    /* unreadable file: the CV still works, it just has no extracted text */
  }
  return '';
}

function tidy(s: string): string {
  return s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 30000);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
const RANGE = new RegExp(
  `(?:(${MONTH_RE})\\s*,?\\s*)?((?:19|20)\\d{2})\\s*(?:-|–|—|to|until)\\s*(?:(?:(${MONTH_RE})\\s*,?\\s*)?((?:19|20)\\d{2})|(present|current|now|today|ongoing|date))`,
  'gi',
);

const monthIndex = (m?: string) => (m ? Math.max(0, MONTHS.indexOf(m.slice(0, 3).toLowerCase())) : 0);

/**
 * Years of work experience worked out from the dates on the CV ("Mar 2021 - Present").
 * Overlapping jobs count once. Only the experience part of the CV is read, so study years are not counted.
 * Returns null when no dated job is found.
 */
export function estimateYears(text: string, now = new Date()): number | null {
  const s = sections(text);
  const source = s.experience || text.replace(/education[\s\S]*$/i, '');
  const spans: [number, number][] = [];
  for (const m of source.matchAll(RANGE)) {
    const start = Number(m[2]) * 12 + monthIndex(m[1]);
    const end = m[5] ? now.getFullYear() * 12 + now.getMonth() : Number(m[4]) * 12 + monthIndex(m[3]) + (m[3] ? 1 : 12);
    if (end > start && end - start <= 12 * 45) spans.push([start, end]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [cs, ce] = spans[0];
  for (const [s2, e2] of spans.slice(1)) {
    if (s2 <= ce) ce = Math.max(ce, e2);
    else { months += ce - cs; [cs, ce] = [s2, e2]; }
  }
  months += ce - cs;
  return Math.floor((months / 12) * 2) / 2; // whole or half years, rounded down so we never overstate
}

const HEADINGS: Record<string, string> = {
  summary: 'summary', 'professional summary': 'summary', profile: 'summary', 'professional profile': 'summary',
  'about me': 'summary', about: 'summary', objective: 'summary', 'career objective': 'summary',
  experience: 'experience', 'work experience': 'experience', 'professional experience': 'experience',
  'employment history': 'experience', employment: 'experience', 'work history': 'experience', 'career history': 'experience',
  education: 'education', skills: 'skills', 'technical skills': 'skills', 'key skills': 'skills', 'core skills': 'skills',
  projects: 'projects', 'personal projects': 'projects', certifications: 'other', certificates: 'other',
  languages: 'other', references: 'other', interests: 'other', awards: 'other',
};

/** Splits a CV into its usual parts (summary, experience, education, skills, ...). */
export function sections(text: string): Record<string, string> {
  const out: Record<string, string[]> = {};
  let current = 'top';
  for (const line of text.split('\n')) {
    const key = HEADINGS[line.trim().toLowerCase().replace(/[:\s]+$/, '')];
    if (key && line.trim().length <= 32) { current = key; continue; }
    (out[current] ??= []).push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

export interface CvFacts {
  years: number | null;
  summary: string;
  experience: string;
}

/** The facts an application email may use, taken from the CV text only. */
export function cvFacts(text: string, now = new Date()): CvFacts {
  const s = sections(text);
  // Many CVs open with a paragraph under the name and no "Summary" heading.
  const intro = (s.top || '').split(/\n+/).filter((l) => l.length >= 80).sort((a, b) => b.length - a.length)[0] ?? '';
  const summary = (s.summary || intro).slice(0, 600);
  const experience = (s.experience || s.projects || '').slice(0, 2500);
  return { years: estimateYears(text, now), summary, experience };
}
