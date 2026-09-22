import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, OnApplicationBootstrap, Post, ServiceUnavailableException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';

export type WhatsAppSessionStatus =
  | 'created' | 'initializing' | 'qr_ready' | 'authenticating' | 'ready' | 'disconnected' | 'action_required' | 'failed';

export interface WhatsAppStatus {
  /** An OpenWA API key is set in backend/.env. Without this the feature is simply hidden. */
  configured: boolean;
  /** The configured OpenWA instance answered. False on another user's machine where it is not running. */
  reachable: boolean;
  session: { status: WhatsAppSessionStatus; phone: string | null; pushName: string | null } | null;
}

/**
 * Thin, optional bridge to a self-hosted OpenWA instance (see services/openwa and SETUP.md) for WhatsApp
 * alerts. Every call is defensive: with no key set, or the instance unreachable (the normal case on a
 * machine that never set this up), status() answers quickly instead of failing the Settings page.
 */
@Injectable()
export class WhatsAppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly sessionName: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {
    this.baseUrl = this.config.get<string>('OPENWA_URL', 'http://127.0.0.1:2785').replace(/\/+$/, '');
    this.apiKey = this.config.get<string>('OPENWA_API_KEY');
    this.sessionName = this.config.get<string>('OPENWA_SESSION_NAME', 'shortlist-alerts');
  }

  get configured(): boolean {
    return !!this.apiKey;
  }

  /**
   * OpenWA does not auto-resume a previously-linked session on its own restart (AUTO_START_SESSIONS is off
   * by design, so an unattended reboot never re-authenticates without you present). If you already linked a
   * number, this resumes it silently using the saved credentials - no new QR needed. Best-effort and never
   * blocks startup: runs in the background, retries for a while since OpenWA (a separate process, started
   * around the same time) is often still compiling when this app finishes booting, and does nothing at all
   * if WhatsApp was never set up or never linked.
   */
  onApplicationBootstrap() {
    if (!this.configured) return;
    void this.resumeSessionWithRetries();
  }

  private async resumeSessionWithRetries(attempts = 10, delayMs = 4000) {
    for (let i = 0; i < attempts; i++) {
      try {
        const session = await this.findSession();
        if (session) {
          if (session.status !== 'ready') await this.connect();
          return; // found the session (linked or not) - no point retrying further
        }
      } catch (err) {
        this.logger.debug({ event: 'whatsapp.resume_failed', attempt: i, error: (err as Error).message });
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  /** Never throws: any network problem just means "not reachable right now". */
  private async call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'x-api-key': this.apiKey ?? '', 'content-type': 'application/json', ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(4000),
      });
      const text = await res.text();
      let body: T | null = null;
      try { body = text ? (JSON.parse(text) as T) : null; } catch { /* non-JSON response */ }
      return { status: res.status, body };
    } catch (err) {
      this.logger.debug({ event: 'whatsapp.unreachable', error: (err as Error).message });
      return { status: 0, body: null };
    }
  }

  private async findSession(): Promise<{ id: string; status: WhatsAppSessionStatus; phone: string | null; pushName: string | null } | null> {
    const list = await this.call<{ id: string; status: WhatsAppSessionStatus; phone: string | null; pushName: string | null }[]>(
      `/api/sessions?name=${encodeURIComponent(this.sessionName)}`,
    );
    return list.body?.[0] ?? null;
  }

  async status(): Promise<WhatsAppStatus> {
    if (!this.configured) return { configured: false, reachable: false, session: null };
    const session = await this.findSession();
    // A 0 status means the fetch itself failed (OpenWA not running); any real HTTP response means reachable.
    const probe = await this.call('/api/sessions');
    return { configured: true, reachable: probe.status !== 0, session: session ? { status: session.status, phone: session.phone, pushName: session.pushName } : null };
  }

  /** Creates the session if it does not exist yet, then starts it. Returns the fresh status. */
  async connect(): Promise<WhatsAppStatus> {
    if (!this.configured) throw new BadRequestException('WhatsApp is not set up on this machine. See SETUP.md.');
    let session = await this.findSession();
    if (!session) {
      const created = await this.call<{ id: string }>('/api/sessions', { method: 'POST', body: JSON.stringify({ name: this.sessionName }) });
      if (created.status === 0) throw new ServiceUnavailableException('OpenWA is not running. Start it and try again.');
      if (created.status >= 400 || !created.body) throw new BadRequestException('OpenWA could not create a session.');
      session = { id: created.body.id, status: 'created', phone: null, pushName: null };
    }
    if (session.status === 'disconnected' || session.status === 'created' || session.status === 'failed') {
      await this.call(`/api/sessions/${session.id}/start`, { method: 'POST' });
    }
    return this.status();
  }

  /** The QR code as a data: URL, ready to put straight in an <img src>. Only meaningful while status is qr_ready. */
  async qrCode(): Promise<string | null> {
    const session = await this.findSession();
    if (!session) return null;
    const res = await this.call<{ qrCode: string; status: string }>(`/api/sessions/${session.id}/qr`);
    return res.status === 200 ? (res.body?.qrCode ?? null) : null;
  }

  async disconnect(): Promise<void> {
    const session = await this.findSession();
    if (!session) return;
    await this.call(`/api/sessions/${session.id}/logout`, { method: 'POST' });
  }

  /**
   * Sends a plain-text WhatsApp message to the configured notify number. Returns false (never throws) when
   * WhatsApp is not set up, not linked, or the send fails - a notification is a nice-to-have, never something
   * that should break analysis.
   */
  async sendText(toPhoneDigitsOnly: string, text: string): Promise<boolean> {
    if (!this.configured || !toPhoneDigitsOnly) return false;
    const session = await this.findSession();
    if (!session || session.status !== 'ready') return false;
    const res = await this.call(`/api/sessions/${session.id}/messages/send-text`, {
      method: 'POST',
      body: JSON.stringify({ chatId: `${toPhoneDigitsOnly}@c.us`, text }),
    });
    return res.status >= 200 && res.status < 300;
  }

  /** Sends a short "it works" message to a number right now, with an honest reason when it can't. */
  async sendTest(phone: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.configured) return { ok: false, reason: 'WhatsApp is not set up on this machine.' };
    if (!phone) return { ok: false, reason: 'No number is set. Enter one above first.' };
    const session = await this.findSession();
    if (!session) return { ok: false, reason: 'Not connected yet. Click Connect WhatsApp first.' };
    if (session.status !== 'ready') return { ok: false, reason: `WhatsApp is ${session.status.replace('_', ' ')}, not connected yet.` };
    const sent = await this.sendText(phone, `✅ Test message from Shortlist BOT. Alerts to ${phone} are working.`);
    return sent ? { ok: true } : { ok: false, reason: 'OpenWA could not send the message. Check that the number is on WhatsApp.' };
  }

  /**
   * Sends a WhatsApp alert for a job that just reached the configured score, to the configured number
   * (your own connected number by default). Sends at most once per job, even across re-analysis. Never
   * throws and never blocks analysis: any problem here just means no alert went out this time.
   */
  async notifyIfMatch(job: { id: string; title: string; company: string }, score: number): Promise<void> {
    try {
      if (!this.configured) return;
      const s = await this.settings.get('whatsapp_notify');
      if (!s.enabled || !s.phone || score < s.minScore) return;

      const analysis = await this.prisma.jobAnalysis.findUnique({ where: { jobId: job.id }, select: { id: true, whatsappNotifiedAt: true } });
      if (!analysis || analysis.whatsappNotifiedAt) return; // no analysis row yet, or already alerted for this job

      const front = this.config.get<string>('FRONTEND_URL', 'http://localhost:5870');
      const text = `🎯 ${score}% match: ${job.title} at ${job.company}\n${front}/jobs/${job.id}`;
      const sent = await this.sendText(s.phone, text);
      if (sent) {
        await this.prisma.jobAnalysis.update({ where: { id: analysis.id }, data: { whatsappNotifiedAt: new Date() } });
        this.logger.log({ event: 'whatsapp.notified', jobId: job.id, title: job.title, company: job.company, score });
      }
    } catch (err) {
      this.logger.warn({ event: 'whatsapp.notify_failed', jobId: job.id, error: (err as Error).message });
    }
  }
}

class TestMessageDto {
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly settings: SettingsService,
  ) {}

  @Get('status')
  status() {
    return this.whatsapp.status();
  }

  @Post('test')
  async test(@Body() dto: TestMessageDto) {
    const phone = dto.phone || (await this.settings.get('whatsapp_notify')).phone;
    return this.whatsapp.sendTest(phone);
  }

  @Post('connect')
  connect() {
    return this.whatsapp.connect();
  }

  @Get('qr')
  async qr() {
    return { qrCode: await this.whatsapp.qrCode() };
  }

  @Post('disconnect')
  async disconnect() {
    await this.whatsapp.disconnect();
    return { ok: true };
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
