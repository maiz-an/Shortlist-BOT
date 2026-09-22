import { autoApplyBlocker, AutoApplyFacts } from '../modules/email/auto-apply.service';
import { SETTING_DEFAULTS } from '../modules/settings/settings.service';

const on = { enabled: true, minScore: 80, dailyLimit: 10 };
const ok: AutoApplyFacts = { status: 'REVIEW', score: 92, recommendation: 'APPLY', applicationEmail: 'hr@acme.com', gmailConnected: true, sentToday: 0 };

describe('auto-apply safety rules', () => {
  it('is OFF by default', () => {
    expect(SETTING_DEFAULTS.auto_apply.enabled).toBe(false);
    expect(autoApplyBlocker(SETTING_DEFAULTS.auto_apply, ok)).toBe('auto-apply is off');
  });
  it('never applies while off, however high the match is', () => {
    expect(autoApplyBlocker({ ...on, enabled: false }, { ...ok, score: 100 })).toBe('auto-apply is off');
  });
  it('allows a job when everything passes', () => {
    expect(autoApplyBlocker(on, ok)).toBeNull();
    expect(autoApplyBlocker(on, { ...ok, score: 80 })).toBeNull(); // exactly at the threshold
  });
  it.each([
    ['below the score threshold', { score: 79 }],
    ['recommendation is not APPLY', { recommendation: 'MAYBE' }],
    ['job is not waiting for review', { status: 'APPLIED' }],
    ['no application email', { applicationEmail: null }],
    ['Gmail not connected', { gmailConnected: false }],
    ['daily limit reached', { sentToday: 10 }],
  ])('blocks when %s', (_n, patch) => {
    expect(autoApplyBlocker(on, { ...ok, ...patch })).not.toBeNull();
  });
  it('uses the configured threshold', () => {
    expect(autoApplyBlocker({ ...on, minScore: 90 }, { ...ok, score: 85 })).not.toBeNull();
    expect(autoApplyBlocker({ ...on, minScore: 70 }, { ...ok, score: 85 })).toBeNull();
  });
});

describe('AutoApplyService.maybeAutoDraft', () => {
  const { AutoApplyService, AUTO_DRAFT_MIN_SCORE } = jest.requireActual('../modules/email/auto-apply.service');

  function build(job: { analysis: { finalMatchScore: number } | null } | null, existingDraft: unknown) {
    const prisma = {
      job: { findUnique: jest.fn().mockResolvedValue(job) },
      emailDraft: { findUnique: jest.fn().mockResolvedValue(existingDraft) },
    };
    const apps = { ensureForJob: jest.fn().mockResolvedValue({ id: 'app-1' }) };
    const generation = { generate: jest.fn().mockResolvedValue({ generatedBy: 'ai' }) };
    const whatsapp = { notifyAutoApplied: jest.fn() };
    const svc = new AutoApplyService(prisma, {}, apps, generation, {}, {}, whatsapp);
    return { svc, prisma, apps, generation, whatsapp };
  }

  it(`generates a draft once a job scores at least ${AUTO_DRAFT_MIN_SCORE}`, async () => {
    const { svc, apps, generation } = build({ analysis: { finalMatchScore: AUTO_DRAFT_MIN_SCORE } }, null);
    await svc.maybeAutoDraft('job-1');
    expect(apps.ensureForJob).toHaveBeenCalledWith('job-1');
    expect(generation.generate).toHaveBeenCalledWith('app-1');
  });

  it('does nothing below the threshold', async () => {
    const { svc, apps, generation } = build({ analysis: { finalMatchScore: AUTO_DRAFT_MIN_SCORE - 1 } }, null);
    await svc.maybeAutoDraft('job-1');
    expect(apps.ensureForJob).not.toHaveBeenCalled();
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('never overwrites a draft that already exists', async () => {
    const { svc, generation } = build({ analysis: { finalMatchScore: 90 } }, { subject: 'existing' });
    await svc.maybeAutoDraft('job-1');
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('does nothing for a job with no analysis yet', async () => {
    const { svc, apps } = build(null, null);
    await svc.maybeAutoDraft('job-1');
    expect(apps.ensureForJob).not.toHaveBeenCalled();
  });

  it('never throws, even when a dependency fails', async () => {
    const { svc, prisma } = build({ analysis: { finalMatchScore: 90 } }, null);
    prisma.emailDraft.findUnique.mockRejectedValue(new Error('db down'));
    await expect(svc.maybeAutoDraft('job-1')).resolves.toBeUndefined();
  });
});

describe('AutoApplyService.maybeApply', () => {
  const { AutoApplyService } = jest.requireActual('../modules/email/auto-apply.service');
  const job = {
    id: 'job-1', title: 'Full Stack Developer', company: 'Acme', status: 'REVIEW', applicationEmail: 'hr@acme.com',
    analysis: { finalMatchScore: 92, recommendation: 'APPLY' },
  };

  function buildReady() {
    const prisma = { job: { findUnique: jest.fn().mockResolvedValue(job) }, emailMessage: { count: jest.fn().mockResolvedValue(0) } };
    const settings = { get: jest.fn().mockResolvedValue({ enabled: true, minScore: 80, dailyLimit: 10 }) };
    const apps = { ensureForJob: jest.fn().mockResolvedValue({ id: 'app-1' }), update: jest.fn() };
    const generation = { generate: jest.fn().mockResolvedValue({ generatedBy: 'ai' }) };
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    const email = { status: jest.fn().mockResolvedValue({ connected: true }) };
    const whatsapp = { notifyAutoApplied: jest.fn() };
    const svc = new AutoApplyService(prisma, settings, apps, generation, sender, email, whatsapp);
    return { svc, prisma, sender, whatsapp };
  }

  it('tells WhatsApp once the application actually sends, with the job and its score', async () => {
    const { svc, sender, whatsapp } = buildReady();
    const result = await svc.maybeApply('job-1');
    expect(result.applied).toBe(true);
    expect(sender.send).toHaveBeenCalled();
    expect(whatsapp.notifyAutoApplied).toHaveBeenCalledWith({ id: 'job-1', title: 'Full Stack Developer', company: 'Acme' }, 92);
  });

  it('never notifies WhatsApp when auto-apply is blocked (nothing was actually sent)', async () => {
    const { svc, prisma, whatsapp } = buildReady();
    // Recommendation is MAYBE, not APPLY - autoApplyBlocker should stop this before anything sends.
    prisma.job.findUnique.mockResolvedValue({ ...job, analysis: { ...job.analysis, recommendation: 'MAYBE' } });
    const result = await svc.maybeApply('job-1');
    expect(result.applied).toBe(false);
    expect(whatsapp.notifyAutoApplied).not.toHaveBeenCalled();
  });
});
