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
