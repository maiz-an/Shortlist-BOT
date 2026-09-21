import { BadRequestException } from '@nestjs/common';
import { AIProvider, AIUnavailableError } from '../modules/ai/ai-provider';
import { extractJson, InvalidAIOutputError, parseAIOutput } from '../modules/ai/json-output';
import { jobAnalysisSchema, toSkillList } from '../modules/ai/schemas';
import { runAiAnalysis } from '../modules/job-analysis/analysis.service';
import { assertManualTransition } from '../modules/applications/status-rules';
import { ApplicationsService } from '../modules/applications/applications.service';
import { buildFallbackEmail, findForbiddenClaims } from '../modules/email/email-draft';
import { generateEmail } from '../modules/email/email-generation.service';
import { responseRate } from '../modules/dashboard/dashboard.module';
import { JobSourceError } from '../modules/job-sources/job-source.interface';
import { LinkedInSource, linkedInJobId, mapCriteria, mapListing } from '../modules/job-sources/linkedin.source';

const validAnalysis = {
  category: 'full stack', matchScore: '91', recommendedCvId: 'cv1', matchedSkills: ['React'], missingSkills: ['AWS'],
  experienceRequired: '2-4 years', experienceCompatible: true, locationCompatible: 'true', salaryMentioned: false,
  applicationMethod: 'email', recommendation: 'apply', reason: 'Strong match',
};

const fakeAi = (...replies: (string | Error)[]): AIProvider & { calls: number } => {
  const p = {
    name: 'fake', model: 'fake', calls: 0,
    isAvailable: async () => ({ ok: true }),
    generate: async () => {
      const r = replies[Math.min(p.calls++, replies.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return p;
};

describe('AI JSON validation', () => {
  it('extracts JSON from fenced/chatty output and think blocks', () => {
    expect(extractJson('<think>hmm {x}</think>Sure!\n```json\n{"a": {"b": "}"}}\n```')).toEqual({ a: { b: '}' } });
  });
  it('coerces and normalizes a valid analysis', () => {
    const out = parseAIOutput(JSON.stringify(validAnalysis), jobAnalysisSchema);
    expect(out).toMatchObject({ category: 'FULL_STACK', matchScore: 91, applicationMethod: 'EMAIL', recommendation: 'APPLY', locationCompatible: true });
  });
  it('repairs list slips from small models but still rejects wrong types', () => {
    expect(toSkillList('AWS, Docker; Kubernetes')).toEqual(['AWS', 'Docker', 'Kubernetes']);
    expect(toSkillList('None')).toEqual([]);
    expect(toSkillList(['  React ', '', 'N/A'])).toEqual(['React']);
    expect(toSkillList('x'.repeat(200) as string)).toEqual(['x'.repeat(80)]);
    expect(toSkillList(null)).toEqual([]);
    const out = parseAIOutput(JSON.stringify({ ...validAnalysis, missingSkills: 'AWS, Terraform', matchedSkills: 'None' }), jobAnalysisSchema);
    expect(out.missingSkills).toEqual(['AWS', 'Terraform']);
    expect(out.matchedSkills).toEqual([]);
    expect(() => parseAIOutput(JSON.stringify({ ...validAnalysis, missingSkills: { a: 1 } }), jobAnalysisSchema)).toThrow(InvalidAIOutputError);
    expect(() => parseAIOutput(JSON.stringify({ ...validAnalysis, missingSkills: [1, 2] }), jobAnalysisSchema)).toThrow(InvalidAIOutputError);
  });
  it.each([
    ['no json', 'I cannot help with that'],
    ['truncated', '{"category": "X", "matchScore": 5'],
    ['score out of range', JSON.stringify({ ...validAnalysis, matchScore: 250 })],
    ['bad enum', JSON.stringify({ ...validAnalysis, recommendation: 'DEFINITELY' })],
    ['missing field', JSON.stringify({ ...validAnalysis, experienceCompatible: undefined })],
  ])('rejects malformed output: %s', (_n, raw) => {
    expect(() => parseAIOutput(raw, jobAnalysisSchema)).toThrow(InvalidAIOutputError);
  });
  const input = { title: 't', company: 'c', description: 'd', cvs: [], candidate: { yearsExperience: null, preferredLocations: [] } };
  it('retries once on invalid output, then succeeds', async () => {
    const ai = fakeAi('garbage', JSON.stringify(validAnalysis));
    expect((await runAiAnalysis(ai, input)).matchScore).toBe(91);
    expect(ai.calls).toBe(2);
  });
  it('fails after two invalid answers', async () => {
    await expect(runAiAnalysis(fakeAi('nope'), input)).rejects.toBeInstanceOf(InvalidAIOutputError);
  });
  it('propagates provider unavailability without retrying', async () => {
    const ai = fakeAi(new AIUnavailableError('down'));
    await expect(runAiAnalysis(ai, input)).rejects.toBeInstanceOf(AIUnavailableError);
    expect(ai.calls).toBe(1);
  });
});

describe('email generation', () => {
  const ok = JSON.stringify({ subject: 'Application for Full Stack Developer', body: 'Dear team, I have worked with React and PostgreSQL on production apps. My CV is attached. Kind regards, Maizan' });
  const bad = JSON.stringify({ subject: 'Application', body: 'Dear team, I am an expert in React and AWS and have shipped many systems. My CV is attached. Regards' });
  it('returns a cleaned draft', async () => {
    const e = await generateEmail(fakeAi(ok), 'p', ['AWS']);
    expect(e.subject).toContain('Full Stack');
  });
  it('rejects claims of missing skills, then accepts a corrected retry', async () => {
    const ai = fakeAi(bad, ok);
    const e = await generateEmail(ai, 'p', ['AWS']);
    expect(e.body).not.toMatch(/AWS/);
    expect(ai.calls).toBe(2);
  });
  it('throws when the model keeps claiming missing skills', async () => {
    await expect(generateEmail(fakeAi(bad), 'p', ['AWS'])).rejects.toBeInstanceOf(InvalidAIOutputError);
  });
  it('detects forbidden claims and builds a fact-only fallback', () => {
    expect(findForbiddenClaims('I know Kubernetes', ['Kubernetes', 'AWS'])).toEqual(['Kubernetes']);
    const f = buildFallbackEmail({ jobTitle: 'Dev', company: 'Acme', candidateName: 'Maizan', cvName: 'Dev CV', matchedSkills: ['React'], yearsExperience: null });
    expect(f.body).toContain('React');
    expect(f.body).not.toMatch(/years/);
    expect(f.subject).toBe('Application for Dev');
  });
});

describe('LinkedIn source', () => {
  const criteria = { keyword: 'Full Stack Developer', location: 'Qatar', fetchDescriptions: false };
  class Failing extends LinkedInSource {
    protected fetchList(): Promise<never> { return Promise.reject(new Error('socket hang up')); }
  }
  class Fixed extends LinkedInSource {
    protected fetchList() {
      return Promise.resolve([
        { position: 'Dev', company: 'Acme', location: 'Doha', date: '2026-09-01', jobUrl: 'https://www.linkedin.com/jobs/view/full-stack-dev-at-acme-3812345678?refId=x' },
        { position: '', company: 'NoTitle' },
        { position: 'Bad date', company: 'X', date: 'garbage' },
      ] as never);
    }
  }
  it('wraps source failures in JobSourceError instead of crashing', async () => {
    await expect(new Failing().search(criteria)).rejects.toBeInstanceOf(JobSourceError);
  });
  it('drops malformed listings and maps the rest', async () => {
    const jobs = await new Fixed().search(criteria);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ sourceKey: 'linkedin', sourceJobId: '3812345678', title: 'Dev', company: 'Acme' });
    expect(jobs[1].postedAt).toBeUndefined();
  });
  it('maps criteria to the library query', () => {
    expect(mapCriteria({ keyword: 'x', datePosted: 'PAST_24_HOURS', jobType: 'FULL_TIME', remote: 'HYBRID', experienceLevel: 'Senior', sortBy: 'relevant', page: 2, limit: 10 }))
      .toMatchObject({ dateSincePosted: '24hr', jobType: 'full time', remoteFilter: 'hybrid', experienceLevel: 'senior', sortBy: 'relevant', page: 2, limit: 10 });
    expect(mapListing({ position: '', company: 'a' } as never)).toBeNull();
    expect(linkedInJobId('https://x/jobs/view/a-b-123456789?z=1')).toBe('123456789');
  });
});

describe('application status changes', () => {
  it('blocks system-only and no-op manual transitions', () => {
    expect(() => assertManualTransition('REVIEW', 'SENDING')).toThrow(BadRequestException);
    expect(() => assertManualTransition('REVIEW', 'NEW')).toThrow(BadRequestException);
    expect(() => assertManualTransition('REVIEW', 'REVIEW')).toThrow(BadRequestException);
    expect(() => assertManualTransition('SENDING', 'REJECTED')).toThrow(BadRequestException);
    expect(() => assertManualTransition('APPLIED', 'INTERVIEW')).not.toThrow();
    expect(() => assertManualTransition('REVIEW', 'REJECTED')).not.toThrow();
  });

  const makePrisma = (job: Record<string, unknown>) => {
    const calls: string[] = [];
    const tx = {
      job: { update: jest.fn(async ({ data }) => calls.push(`job:${data.status}`)) },
      application: { update: jest.fn(async ({ data }) => calls.push(`app:${data.status}:${data.appliedDate ? 'dated' : 'nodate'}`)) },
      applicationStatusHistory: { create: jest.fn(async ({ data }) => calls.push(`hist:${data.fromStatus}->${data.toStatus}`)) },
    };
    const prisma = {
      job: { findUnique: jest.fn(async () => job) },
      application: { findUnique: jest.fn(async () => ({ id: 'a1', status: 'APPLIED' })) },
      $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    };
    return { prisma, calls };
  };

  it('updates job, application and history together and stamps applied date', async () => {
    const { prisma, calls } = makePrisma({ id: 'j1', status: 'SENDING', application: { id: 'a1', status: 'SENDING', appliedDate: null } });
    await new ApplicationsService(prisma as never).setStatus('j1', 'APPLIED');
    expect(calls).toEqual(['job:APPLIED', 'app:APPLIED:dated', 'hist:SENDING->APPLIED']);
  });
  it('rejects an illegal manual change and does not touch the database', async () => {
    const { prisma, calls } = makePrisma({ id: 'j1', status: 'REVIEW', application: { id: 'a1', status: 'REVIEW' } });
    await expect(new ApplicationsService(prisma as never).setStatus('j1', 'SENDING', { manual: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(calls).toHaveLength(0);
  });
  it('computes response rate', () => {
    expect(responseRate(0, 0)).toBe(0);
    expect(responseRate(8, 2)).toBe(25);
  });
});
