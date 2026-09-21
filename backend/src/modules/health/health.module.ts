import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_PROVIDER, AIProvider } from '../ai/ai-provider';
import { AnalysisQueue } from '../job-analysis/analysis-queue.service';
import { JobAnalysisModule } from '../job-analysis/job-analysis.module';

export type CheckStatus = 'ok' | 'warn' | 'error';
export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  /** What to do about it, when it is not ok. */
  fix?: string;
  href?: string;
}

const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;

@Injectable()
export class HealthService {
  private lastCpu = process.cpuUsage();
  private lastAt = Date.now();
  private readonly startedAt = new Date(Date.now() - process.uptime() * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly ai: AIProvider,
    private readonly queue: AnalysisQueue,
  ) {}

  /** CPU use of this process since the previous call, as a percentage of one core. */
  private cpuPercent(): number {
    const now = Date.now();
    const usage = process.cpuUsage(this.lastCpu);
    const elapsedMs = Math.max(now - this.lastAt, 1);
    this.lastCpu = process.cpuUsage();
    this.lastAt = now;
    return Math.round(((usage.user + usage.system) / 1000 / elapsedMs) * 1000) / 10;
  }

  async details() {
    const checks: HealthCheck[] = [];

    // Database
    let db = { ok: false, latencyMs: null as number | null, error: undefined as string | undefined };
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = { ok: true, latencyMs: Date.now() - t0, error: undefined };
    } catch (e) {
      db.error = (e as Error).message.split('\n').pop()?.slice(0, 160);
    }
    checks.push(
      db.ok
        ? { id: 'db', label: 'Database', status: (db.latencyMs ?? 0) > 500 ? 'warn' : 'ok', message: `Connected (${db.latencyMs} ms)` }
        : { id: 'db', label: 'Database', status: 'error', message: 'Cannot reach the database.', fix: 'Start it (in Setup: npm run db) and check DATABASE_URL in backend/.env.' },
    );

    // AI model
    const [status, runtime] = await Promise.all([this.ai.isAvailable(), this.ai.details ? this.ai.details() : Promise.resolve(undefined)]);
    const modelLoaded = runtime?.loaded?.some((m) => m.name.startsWith(this.ai.model)) ?? false;
    checks.push(
      status.ok
        ? { id: 'ai', label: 'AI model', status: 'ok', message: modelLoaded ? `${this.ai.model} is loaded and ready.` : `${this.ai.model} is installed. The first analysis will be slower while it loads into memory.` }
        : { id: 'ai', label: 'AI model', status: 'error', message: status.detail ?? 'The AI model is not available.', fix: `Start Ollama and run: ollama pull ${this.ai.model}` },
    );

    // Email
    const [account, clientId] = [await this.prisma.emailAccount.findFirst({ where: { provider: 'GMAIL' } }).catch(() => null), this.config.get<string>('GMAIL_CLIENT_ID', '')];
    const email = { configured: !!clientId, connected: !!account?.encryptedRefreshToken, address: account?.emailAddress ?? null };
    checks.push(
      !email.configured
        ? { id: 'email', label: 'Gmail', status: 'warn', message: 'Gmail is not set up, so applications cannot be sent yet.', fix: 'Add the Google client ID and secret to backend/.env.', href: '/email' }
        : !email.connected
          ? { id: 'email', label: 'Gmail', status: 'warn', message: 'Gmail is set up but no account is connected.', fix: 'Connect your Gmail account.', href: '/email' }
          : { id: 'email', label: 'Gmail', status: 'ok', message: `Connected as ${email.address}.` },
    );

    // CV files
    let cvTotal = 0, cvMissing = 0;
    try {
      const cvs = await this.prisma.cVProfile.findMany({ where: { enabled: true }, select: { filePath: true } });
      cvTotal = cvs.length;
      const dir = path.resolve(process.cwd(), this.config.get<string>('CV_STORAGE_PATH', './storage/cvs'));
      for (const c of cvs) {
        const ok = c.filePath ? await fs.access(path.join(dir, path.basename(c.filePath))).then(() => true, () => false) : false;
        if (!ok) cvMissing++;
      }
    } catch { /* database problem is already reported above */ }
    checks.push(
      cvTotal === 0
        ? { id: 'cv', label: 'CV files', status: 'warn', message: 'No enabled CV profile.', fix: 'Add a CV profile.', href: '/cvs' }
        : cvMissing > 0
          ? { id: 'cv', label: 'CV files', status: 'warn', message: `${cvMissing} of ${cvTotal} enabled CV profiles have no uploaded file.`, fix: 'Upload the files so applications can attach them.', href: '/cvs' }
          : { id: 'cv', label: 'CV files', status: 'ok', message: `All ${cvTotal} enabled CV profiles have a file.` },
    );

    // Security config
    const tokenSet = !!this.config.get('API_TOKEN');
    if (!tokenSet) checks.push({ id: 'token', label: 'API protection', status: 'warn', message: 'API_TOKEN is not set, so the local API is unprotected.', fix: 'Run npm run init-env in backend.' });

    // Queue and last search
    const q = this.queue.status();
    if (q.lastError) checks.push({ id: 'queue', label: 'Analysis queue', status: 'warn', message: `The last analysis failed: ${q.lastError}`, fix: 'Fix the cause, then use "Retry unanalyzed jobs" on the Jobs page.', href: '/jobs' });
    const lastRun = await this.prisma.searchRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true, jobsFound: true, jobsNew: true } }).catch(() => null);
    if (lastRun && (lastRun.status === 'FAILED' || lastRun.status === 'PARTIAL')) {
      checks.push({ id: 'search', label: 'Last search', status: 'warn', message: `The last search ended ${lastRun.status.toLowerCase()}. A job source may be blocking or unavailable.`, fix: 'Check the run details on the Search page.', href: '/search' });
    }

    const mem = process.memoryUsage();
    if (mem.rss > 1.5 * 1073741824) checks.push({ id: 'mem', label: 'Backend memory', status: 'warn', message: `The backend is using ${mb(mem.rss)} MB.`, fix: 'Restart the backend if this keeps growing.' });

    const worst: CheckStatus = checks.some((c) => c.status === 'error') ? 'error' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';

    return {
      overall: worst,
      checkedAt: new Date().toISOString(),
      backend: {
        startedAt: this.startedAt.toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        node: process.version,
        pid: process.pid,
        platform: `${os.platform()} ${os.release()}`,
        memoryMb: { rss: mb(mem.rss), heapUsed: mb(mem.heapUsed), heapTotal: mb(mem.heapTotal) },
        cpuPercent: this.cpuPercent(),
        systemMemoryMb: { total: Math.round(os.totalmem() / 1048576), free: Math.round(os.freemem() / 1048576) },
        apiProtected: tokenSet,
      },
      database: db,
      ai: {
        provider: this.ai.name, model: this.ai.model, ready: status.ok, detail: status.detail ?? null,
        reachable: runtime?.reachable ?? status.ok, latencyMs: runtime?.latencyMs ?? null, version: runtime?.version ?? null, loaded: runtime?.loaded ?? [],
      },
      email,
      queue: q,
      lastSearch: lastRun,
      checks,
    };
  }
}

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('details')
  details() {
    return this.health.details();
  }
}

@Module({ imports: [JobAnalysisModule], controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
