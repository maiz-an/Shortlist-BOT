import { buildReason } from '../modules/job-analysis/reason';
import { calculateScore, recommendationFor, ScoreInput } from '../modules/job-analysis/scoring';
import { cleanMissingSkills, coveredByCv, mentionedInText } from '../modules/job-analysis/skill-text';
import { SETTING_DEFAULTS } from '../modules/settings/settings.service';

const T = SETTING_DEFAULTS.match_score_thresholds;
const FS_CV = ['JavaScript', 'TypeScript', 'React', 'NestJS', 'PostgreSQL', 'Git', 'GitHub', 'GitLab', 'CI/CD', 'Agile', 'Troubleshooting'];

describe('missing-skills cleanup', () => {
  const javaAd = 'Senior Java engineer. Java 17+, Spring Boot, Docker, Kubernetes, CI/CD tools, Agile/Scrum ceremonies, code reviews, project planning, unit testing.';

  it('drops skills already on the CV, vague filler and duplicates; keeps real gaps', () => {
    const out = cleanMissingSkills(
      ['Java', 'Java 17+', 'Spring Boot', 'Docker', 'CI/CD tools', 'Agile/Scrum ceremonies', 'code reviews', 'project planning', 'unit testing'],
      FS_CV, javaAd,
    );
    expect(out).toEqual(['Java', 'Spring Boot', 'Docker', 'unit testing']);
  });
  it('treats "troubleshooting skills" as covered by "Troubleshooting"', () => {
    expect(coveredByCv('troubleshooting skills', FS_CV)).toBe(true);
    expect(coveredByCv('Kubernetes', FS_CV)).toBe(false);
    expect(coveredByCv('javascript frameworks', ['Java'])).toBe(false); // "java" must not match inside "javascript"
  });
  it('never lists a gap the ad does not mention (the model may invent them)', () => {
    expect(cleanMissingSkills(['Kubernetes', 'Terraform'], FS_CV, 'We use Docker only.')).toEqual([]);
  });
  it('recognises real gaps that are worded differently from the ad', () => {
    const ad = 'Track SLA compliance. Cisco certified engineers preferred. ITIL knowledge is a plus.';
    expect(mentionedInText(ad, 'SLA tracking')).toBe(true);
    expect(mentionedInText(ad, 'Cisco certifications')).toBe(true);
    expect(mentionedInText(ad, 'ITIL/PRINCE2')).toBe(true);
    expect(mentionedInText(ad, 'Kubernetes')).toBe(false);
  });
  it('caps the list at 12', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Tool${i}X`);
    expect(cleanMissingSkills(many, [], many.join(' '))).toHaveLength(12);
  });
});

describe('score quality', () => {
  const cv = { skills: FS_CV, preferredJobKeywords: ['Full Stack Developer'], excludedKeywords: [] as string[] };
  const base = (o: Partial<ScoreInput> = {}): ScoreInput => ({
    job: { title: 'Full Stack Developer', description: 'Great role.', location: 'Doha, Qatar', jobType: 'FULL_TIME' },
    cv,
    constraints: { excludedKeywords: [], preferredJobTypes: ['FULL_TIME'], preferredLocations: ['Qatar'], keywords: ['Full Stack Developer'] },
    ai: { matchScore: 70, missingSkills: [], experienceCompatible: true, locationCompatible: true },
    candidateYears: 4, cvRelevance: 1, ...o,
  });

  it('an ad that names only one skill does not earn a free 100% skills score', () => {
    const one = calculateScore(base({ job: { ...base().job, description: 'We need React.' } }));
    const many = calculateScore(base({ job: { ...base().job, description: 'React, TypeScript, NestJS, PostgreSQL, Git.' } }));
    expect(one.breakdown.skills).toBeLessThan(28);
    expect(many.breakdown.skills).toBe(35);
    expect(one.breakdown.skills).toBeGreaterThan(17.5); // still rewarded, just not fully
  });
  it('being one year short is a stretch, not a fit', () => {
    const r = calculateScore(base({ job: { ...base().job, description: 'Requires 5-10 years of experience.' } }));
    expect(r.experienceRequiredYears).toBe(5);
    expect(r.experienceCompatible).toBe(false);
    expect(r.breakdown.experience).toBe(6);
    const fit = calculateScore(base({ job: { ...base().job, description: 'Requires 4+ years of experience.' } }));
    expect(fit.experienceCompatible).toBe(true);
    expect(fit.breakdown.experience).toBe(10);
  });
  it('a strong AI SKIP can never become an automatic APPLY', () => {
    expect(recommendationFor(75, T, [], { recommendation: 'SKIP' })).toBe('MAYBE');
    expect(recommendationFor(75, T, [], { recommendation: 'APPLY' })).toBe('APPLY');
    expect(recommendationFor(75, T, [])).toBe('APPLY');
    expect(recommendationFor(40, T, [], { recommendation: 'SKIP' })).toBe('SKIP');
  });

  it('Vodafone-style case: senior ad, many real gaps, AI said SKIP -> no longer APPLY', () => {
    const it = ['Help Desk', 'Troubleshooting', 'Remote Desktop', 'Windows Server', 'Microsoft 365', 'Active Directory'];
    const ad = 'L1 technical support advisor for fixed operations. Track SLA compliance and inventory. Cisco certification and ITIL/PRINCE2 preferred. Field team coordination. Troubleshooting. 5-10 years of experience.';
    const r = calculateScore({
      job: { title: 'Fixed L1 Technical Support Advisor', description: ad, location: 'Doha, Qatar', jobType: null },
      cv: { skills: it, preferredJobKeywords: ['IT Support', 'Technical Support', 'Help Desk'], excludedKeywords: [] },
      constraints: { excludedKeywords: [], preferredJobTypes: [], preferredLocations: ['Qatar'], keywords: ['Technical Support'] },
      ai: { matchScore: 70, missingSkills: ['Fixed Operations', 'SLA tracking', 'Technical inventory tracking', 'Field team coordination', 'Cisco certifications', 'ITIL/PRINCE2'], experienceCompatible: false, locationCompatible: true },
      candidateYears: 4, cvRelevance: 0.8,
    });
    expect(r.matchedSkills).toEqual(['Troubleshooting']);
    expect(r.missingSkills.length).toBeGreaterThanOrEqual(4); // the gaps are no longer thrown away
    expect(r.experienceCompatible).toBe(false);
    expect(r.score).toBeLessThan(70);
    expect(recommendationFor(r.score, T, r.excludedHits, { recommendation: 'SKIP' })).not.toBe('APPLY');
  });
});

describe('reason text', () => {
  const base = {
    score: 66, recommendation: 'MAYBE' as const, hasCv: true, matched: ['Troubleshooting'], missing: ['SLA tracking', 'ITIL'],
    requiredYears: 5, candidateYears: 4, experienceCompatible: false, locationCompatible: true, excludedHits: [] as string[],
  };
  it('is built from the real numbers and says when the AI disagreed', () => {
    const r = buildReason({ ...base, ai: { recommendation: 'SKIP', matchScore: 70, reason: 'Lacks certifications.' } });
    expect(r).toContain('Matches 1 of your skills (Troubleshooting).');
    expect(r).toContain('Gaps: SLA tracking, ITIL.');
    expect(r).toContain('Asks for 5+ years; you have 4.');
    expect(r).toContain('The AI was more cautious');
  });
  it('shows the AI note plainly when it agrees', () => {
    const r = buildReason({ ...base, score: 85, recommendation: 'APPLY', experienceCompatible: true, ai: { recommendation: 'APPLY', matchScore: 84, reason: 'Good fit.' } });
    expect(r).toContain('AI note: Good fit.');
    expect(r).not.toContain('more cautious');
  });
  it('handles no CV and no matched skills', () => {
    const r = buildReason({ ...base, hasCv: false, matched: [], missing: [], requiredYears: null, experienceCompatible: true, ai: { recommendation: 'MAYBE', matchScore: 60, reason: '' } });
    expect(r).toContain('No enabled CV profile');
    expect(r).toContain('None of your listed skills are named in the ad.');
  });
});
