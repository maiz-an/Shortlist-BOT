import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from '../modules/whatsapp/whatsapp.module';

// Importing PrismaService pulls in @prisma/client, which loads backend/.env as an import side effect -
// including the real OPENWA_API_KEY when one is set for local development. Strip it so these tests see
// only what each one explicitly passes, regardless of what is configured on the machine running them.
beforeEach(() => {
  delete process.env.OPENWA_API_KEY;
});

function build(env: Record<string, string> = {}) {
  const config = new ConfigService(env);
  const prisma = { jobAnalysis: { findUnique: jest.fn(), update: jest.fn() } };
  const settings = { get: jest.fn().mockResolvedValue({ enabled: false, phone: '', minScore: 70 }) };
  return new WhatsAppService(config, prisma as never, settings as never);
}

describe('WhatsAppService', () => {
  it('reports not configured with no API key, and never calls the network', async () => {
    const svc = build();
    expect(svc.configured).toBe(false);
    await expect(svc.status()).resolves.toEqual({ configured: false, reachable: false, session: null });
  });

  it('reports not reachable when the configured URL refuses the connection (no OpenWA on this machine)', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const svc = build({ OPENWA_API_KEY: 'k' });
    const s = await svc.status();
    expect(s).toEqual({ configured: true, reachable: false, session: null });
    fetchSpy.mockRestore();
  });

  it('never sends a message when not configured', async () => {
    const svc = build();
    await expect(svc.sendText('9740000000', 'hi')).resolves.toBe(false);
  });

  it('connect() refuses cleanly when not configured', async () => {
    const svc = build();
    await expect(svc.connect()).rejects.toThrow('not set up');
  });
});

describe('WhatsAppService.notifyIfMatch', () => {
  const job = { id: 'job-1', title: 'Full Stack Developer', company: 'Acme' };

  function buildConfigured(notify: { enabled: boolean; phone: string; minScore: number }, analysis: { id: string; whatsappNotifiedAt: Date | null } | null) {
    const config = new ConfigService({ OPENWA_API_KEY: 'k' });
    const prisma = { jobAnalysis: { findUnique: jest.fn().mockResolvedValue(analysis), update: jest.fn() } };
    const settings = { get: jest.fn().mockResolvedValue(notify) };
    const svc = new WhatsAppService(config, prisma as never, settings as never);
    const sendText = jest.spyOn(svc, 'sendText').mockResolvedValue(true);
    return { svc, prisma, sendText };
  }

  it('does nothing when the feature is off', async () => {
    const { svc, sendText } = buildConfigured({ enabled: false, phone: '9740000000', minScore: 70 }, { id: 'a1', whatsappNotifiedAt: null });
    await svc.notifyIfMatch(job, 95);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('does nothing below the configured score', async () => {
    const { svc, sendText } = buildConfigured({ enabled: true, phone: '9740000000', minScore: 70 }, { id: 'a1', whatsappNotifiedAt: null });
    await svc.notifyIfMatch(job, 65);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('does nothing with no number set', async () => {
    const { svc, sendText } = buildConfigured({ enabled: true, phone: '', minScore: 70 }, { id: 'a1', whatsappNotifiedAt: null });
    await svc.notifyIfMatch(job, 95);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('never notifies twice for the same job', async () => {
    const { svc, sendText } = buildConfigured({ enabled: true, phone: '9740000000', minScore: 70 }, { id: 'a1', whatsappNotifiedAt: new Date() });
    await svc.notifyIfMatch(job, 95);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('sends and records the job as notified when everything qualifies', async () => {
    const { svc, prisma, sendText } = buildConfigured({ enabled: true, phone: '9740000000', minScore: 70 }, { id: 'a1', whatsappNotifiedAt: null });
    await svc.notifyIfMatch(job, 95);
    expect(sendText).toHaveBeenCalledWith('9740000000', expect.stringContaining('95%'));
    expect(sendText).toHaveBeenCalledWith('9740000000', expect.stringContaining('Full Stack Developer'));
    expect(prisma.jobAnalysis.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { whatsappNotifiedAt: expect.any(Date) } });
  });

  it('never throws when a dependency fails', async () => {
    const { svc, prisma } = buildConfigured({ enabled: true, phone: '9740000000', minScore: 70 }, { id: 'a1', whatsappNotifiedAt: null });
    prisma.jobAnalysis.findUnique.mockRejectedValue(new Error('db down'));
    await expect(svc.notifyIfMatch(job, 95)).resolves.toBeUndefined();
  });
});

describe('WhatsAppService.onApplicationBootstrap', () => {
  it('returns immediately (never blocks app startup) and does nothing when not configured', () => {
    const svc = build();
    const fetchSpy = jest.spyOn(global, 'fetch');
    expect(svc.onApplicationBootstrap()).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // resumeSessionWithRetries takes its own (attempts, delayMs) so tests can run it fast and deterministically,
  // instead of going through onApplicationBootstrap's real production defaults (10 attempts, 4s apart).
  type WithRetries = { resumeSessionWithRetries(attempts?: number, delayMs?: number): Promise<void> };

  it('does not throw when OpenWA stays unreachable for every retry', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const config = new ConfigService({ OPENWA_API_KEY: 'k' });
    const prisma = { jobAnalysis: { findUnique: jest.fn(), update: jest.fn() } };
    const settings = { get: jest.fn() };
    const svc = new WhatsAppService(config, prisma as never, settings as never);
    await expect((svc as unknown as WithRetries).resumeSessionWithRetries(2, 0)).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('reconnects a found session that is not ready, and stops retrying once found', async () => {
    const config = new ConfigService({ OPENWA_API_KEY: 'k' });
    const prisma = { jobAnalysis: { findUnique: jest.fn(), update: jest.fn() } };
    const settings = { get: jest.fn() };
    const svc = new WhatsAppService(config, prisma as never, settings as never);
    const findSession = jest.spyOn(svc as unknown as { findSession(): Promise<unknown> }, 'findSession')
      .mockResolvedValue({ id: 's1', status: 'disconnected', phone: null, pushName: null });
    const connect = jest.spyOn(svc, 'connect').mockResolvedValue({ configured: true, reachable: true, session: null });
    await (svc as unknown as WithRetries).resumeSessionWithRetries(5, 0);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(findSession).toHaveBeenCalledTimes(1); // found it first try - the other 4 attempts never ran
  });
});

describe('WhatsAppService.sendTest', () => {
  function build2(env: Record<string, string> = {}) {
    const config = new ConfigService(env);
    const prisma = { jobAnalysis: { findUnique: jest.fn(), update: jest.fn() } };
    const settings = { get: jest.fn() };
    return new WhatsAppService(config, prisma as never, settings as never);
  }

  it('refuses when not configured', async () => {
    const svc = build2();
    await expect(svc.sendTest('9740000000')).resolves.toEqual({ ok: false, reason: expect.stringContaining('not set up') });
  });

  it('refuses when no number is given', async () => {
    const svc = build2({ OPENWA_API_KEY: 'k' });
    await expect(svc.sendTest('')).resolves.toEqual({ ok: false, reason: expect.stringContaining('No number') });
  });

  it('refuses when not connected', async () => {
    const svc = build2({ OPENWA_API_KEY: 'k' });
    jest.spyOn(svc as unknown as { findSession(): Promise<unknown> }, 'findSession').mockResolvedValue(null);
    await expect(svc.sendTest('9740000000')).resolves.toEqual({ ok: false, reason: expect.stringContaining('Connect WhatsApp') });
  });

  it('refuses when connected but not ready yet', async () => {
    const svc = build2({ OPENWA_API_KEY: 'k' });
    jest.spyOn(svc as unknown as { findSession(): Promise<unknown> }, 'findSession').mockResolvedValue({ id: 's1', status: 'qr_ready', phone: null, pushName: null });
    const r = await svc.sendTest('9740000000');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('qr ready');
  });

  it('sends and reports success when everything is ready', async () => {
    const svc = build2({ OPENWA_API_KEY: 'k' });
    jest.spyOn(svc as unknown as { findSession(): Promise<unknown> }, 'findSession').mockResolvedValue({ id: 's1', status: 'ready', phone: '9740000000', pushName: 'Me' });
    jest.spyOn(svc, 'sendText').mockResolvedValue(true);
    await expect(svc.sendTest('9740000000')).resolves.toEqual({ ok: true });
  });
});
