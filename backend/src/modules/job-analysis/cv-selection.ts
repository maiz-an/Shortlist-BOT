import { containsTerm } from '../../common/utils/normalize';

export interface CvCandidate {
  id: string;
  name: string;
  category: string;
  skills: string[];
  preferredJobKeywords: string[];
  excludedKeywords: string[];
  /** Years of work experience read from the CV's own dates. */
  years?: number | null;
}

export interface CvRanking {
  cvId: string | null;
  relevance: number;
  ranking: { id: string; score: number }[];
  /** True when the top two CVs are too close to call deterministically. */
  ambiguous: boolean;
}

function keywordFit(title: string, keywords: string[]): number {
  const words = new Set(title.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean));
  let best = 0;
  for (const k of keywords) {
    if (containsTerm(title, k)) return 1;
    const kw = k.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
    if (kw.length) best = Math.max(best, kw.filter((w) => words.has(w)).length / kw.length);
  }
  return best;
}

export function scoreCv(job: { title: string; description: string }, cv: CvCandidate, aiCategory?: string): number {
  if (cv.excludedKeywords.some((k) => containsTerm(job.title, k))) return 0;
  const text = `${job.title}\n${job.description}`;
  const title = keywordFit(job.title, cv.preferredJobKeywords);
  const hits = cv.skills.filter((s) => containsTerm(text, s)).length;
  const skills = cv.skills.length ? Math.min(1, hits / Math.min(cv.skills.length, 6)) : 0;
  const category = aiCategory && aiCategory.toUpperCase() === cv.category.toUpperCase() ? 1 : 0;
  return 0.4 * title + 0.4 * skills + 0.2 * category;
}

/** Ranks enabled CVs for a job. The AI's suggested CV only nudges the result (+0.05). */
export function selectCv(
  job: { title: string; description: string },
  cvs: CvCandidate[],
  aiCategory?: string,
  aiRecommendedId?: string | null,
): CvRanking {
  if (!cvs.length) return { cvId: null, relevance: 0, ranking: [], ambiguous: false };
  const ranking = cvs
    .map((cv) => ({ id: cv.id, score: scoreCv(job, cv, aiCategory) + (cv.id === aiRecommendedId ? 0.05 : 0) }))
    .sort((a, b) => b.score - a.score);
  const [top, second] = ranking;
  return {
    cvId: top.id,
    relevance: Math.min(1, top.score),
    ranking,
    ambiguous: !!second && top.score > 0 && top.score - second.score < 0.05,
  };
}
