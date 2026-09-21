import { CvCandidate, selectCv } from '../modules/job-analysis/cv-selection';
import { calculateScore, parseRequiredYears, recommendationFor, ScoreInput, scoreLabel } from '../modules/job-analysis/scoring';
import { SETTING_DEFAULTS } from '../modules/settings/settings.service';

const T = SETTING_DEFAULTS.match_score_thresholds;
const dev: CvCandidate = {
  id: 'dev', name: 'Dev CV', category: 'FULL_STACK', skills: ['React', 'TypeScript', 'NestJS', 'PostgreSQL'],
  preferredJobKeywords: ['Full Stack Developer', 'React Developer'], excludedKeywords: [],
};
const support: CvCandidate = {
  id: 'sup', name: 'Support CV', category: 'IT_SUPPORT', skills: ['Active Directory', 'Help Desk', 'Networking'],
  preferredJobKeywords: ['IT Support', 'Help Desk'], excludedKeywords: [],
};

const input = (o: Partial<ScoreInput> = {}): ScoreInput => ({
  job: { title: 'Full Stack Developer', description: 'Build apps with React, TypeScript, NestJS and PostgreSQL. Experience with AWS. 2+ years experience.', location: 'Doha, Qatar', jobType: 'FULL_TIME' },
  cv: dev,
  constraints: { excludedKeywords: [], preferredJobTypes: ['FULL_TIME'], preferredLocations: ['Qatar'], keywords: ['Full Stack Developer'] },
  ai: { matchScore: 90, missingSkills: ['AWS', 'Kubernetes'], experienceCompatible: true, locationCompatible: true },
  candidateYears: 3, cvRelevance: 1, ...o,
});

describe('score calculation', () => {
  it('gives a strong score for a strong match', () => {
    const r = calculateScore(input());
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.matchedSkills).toEqual(['React', 'TypeScript', 'NestJS', 'PostgreSQL']);
    expect(r.missingSkills).toEqual(['AWS']); // Kubernetes is not in the job text, so the AI claim is dropped
  });
  it('does not just echo the AI score', () => {
    const ai = (matchScore: number) => ({ matchScore, missingSkills: [], experienceCompatible: true, locationCompatible: true });
    expect(calculateScore(input({ ai: ai(100) })).score - calculateScore(input({ ai: ai(0) })).score).toBe(10);
    const bad = calculateScore(input({ cv: support, cvRelevance: 0.05, job: { title: 'Accountant', description: 'Ledgers and audits', location: 'Dubai', jobType: 'CONTRACT' } }));
    expect(bad.score).toBeLessThan(50);
  });
  it('penalizes excluded keywords, more when in the title', () => {
    const inDesc = calculateScore(input({ constraints: { ...input().constraints, excludedKeywords: ['AWS'] } }));
    const inTitle = calculateScore(input({ constraints: { ...input().constraints, excludedKeywords: ['Developer'] } }));
    expect(inDesc.excludedHits).toEqual(['AWS']);
    expect(calculateScore(input()).score - inDesc.score).toBe(25);
    expect(inTitle.score).toBeLessThan(inDesc.score);
  });
  it('uses candidate years to judge experience', () => {
    const senior = input({ job: { ...input().job, description: 'Requires 8+ years of experience with React.' }, candidateYears: 2 });
    expect(calculateScore(senior).experienceCompatible).toBe(false);
    expect(parseRequiredYears('Minimum 5 years of professional experience')).toBe(5);
    expect(parseRequiredYears('2-4 years experience')).toBe(2);
    expect(parseRequiredYears('no mention')).toBeNull();
  });
  it('flags location mismatch against preferred locations', () => {
    const r = calculateScore(input({ job: { ...input().job, location: 'Berlin, Germany', description: 'React role' } }));
    expect(r.locationCompatible).toBe(false);
  });
  it('scores 0 skills and cv relevance when no CV exists', () => {
    const r = calculateScore(input({ cv: null }));
    expect(r.breakdown.skills).toBe(0);
    expect(r.breakdown.cvRelevance).toBe(0);
  });
  it('stays within 0..100', () => {
    const r = calculateScore(input({ constraints: { ...input().constraints, excludedKeywords: ['Developer'] }, ai: { ...input().ai, matchScore: 0 } }));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('score labels and recommendation (configurable thresholds)', () => {
  it.each([[0, 'poor'], [49, 'poor'], [50, 'possible'], [69, 'possible'], [70, 'good'], [80, 'strong'], [89, 'strong'], [90, 'excellent'], [100, 'excellent']])('%i -> %s', (s, l) => {
    expect(scoreLabel(s as number, T)).toBe(l);
  });
  it('respects custom thresholds', () => {
    expect(scoreLabel(60, { ...T, good: [60, 79], possible: [40, 59] })).toBe('good');
  });
  it('recommendation follows score, excluded keywords force SKIP', () => {
    expect(recommendationFor(75, T, [])).toBe('APPLY');
    expect(recommendationFor(55, T, [])).toBe('MAYBE');
    expect(recommendationFor(30, T, [])).toBe('SKIP');
    expect(recommendationFor(75, T, ['unpaid'])).toBe('SKIP');
  });
});

describe('CV selection', () => {
  const devJob = { title: 'React Developer', description: 'React, TypeScript, NestJS' };
  const supJob = { title: 'IT Support Specialist', description: 'Help Desk, Active Directory, Networking' };
  it('picks the developer CV for a developer job', () => {
    expect(selectCv(devJob, [dev, support]).cvId).toBe('dev');
  });
  it('picks the support CV for a support job', () => {
    expect(selectCv(supJob, [dev, support], 'IT_SUPPORT').cvId).toBe('sup');
  });
  it('ignores an unknown AI-recommended id and handles no CVs', () => {
    expect(selectCv(devJob, [dev, support], undefined, 'nope').cvId).toBe('dev');
    expect(selectCv(devJob, []).cvId).toBeNull();
  });
  it('a CV with a matching excluded keyword scores zero', () => {
    const r = selectCv(devJob, [{ ...dev, excludedKeywords: ['React'] }, support]);
    expect(r.ranking.find((x) => x.id === 'dev')!.score).toBe(0);
  });
  it('flags near-ties as ambiguous', () => {
    expect(selectCv(devJob, [{ ...dev, id: 'a' }, { ...dev, id: 'b' }]).ambiguous).toBe(true);
  });
});
