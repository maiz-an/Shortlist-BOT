import { Controller, Get, Injectable, Logger, Module } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../../package.json') as { version: string };

const REPO = 'maiz-an/Shortlist-BOT';
const CHECK_TTL_MS = 60 * 60 * 1000; // GitHub's unauthenticated API allows 60 req/hour per IP; once an hour is plenty

export interface UpdateCheck {
  current: string;
  checked: boolean;
  /** Only set when checked is true. */
  latest?: string;
  updateAvailable?: boolean;
  releaseUrl?: string;
  publishedAt?: string;
  /** Why the check failed (no internet, rate-limited, ...), only set when checked is false. */
  error?: string;
}

/** "1.10.2" -> [1, 10, 2]; anything that does not parse sorts as lower than everything real. */
function parseVersion(v: string): [number, number, number] {
  const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [-1, -1, -1];
}

/** True when `a` is a newer version than `b`. */
export function isNewer(a: string, b: string): boolean {
  const [a1, a2, a3] = parseVersion(a);
  const [b1, b2, b3] = parseVersion(b);
  return a1 !== b1 ? a1 > b1 : a2 !== b2 ? a2 > b2 : a3 > b3;
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  readonly currentVersion = pkg.version;
  private cache: { at: number; result: UpdateCheck } | null = null;

  /** Checks GitHub's releases for a newer tag. Never throws; a failed check just reports checked: false. */
  async updateCheck(): Promise<UpdateCheck> {
    if (this.cache && Date.now() - this.cache.at < CHECK_TTL_MS) return this.cache.result;
    const result = await this.fetchLatest();
    this.cache = { at: Date.now(), result };
    return result;
  }

  private async fetchLatest(): Promise<UpdateCheck> {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'Shortlist-BOT' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return { current: this.currentVersion, checked: false, error: `GitHub returned HTTP ${res.status}` };
      const data = (await res.json()) as { tag_name?: string; html_url?: string; published_at?: string };
      const latest = (data.tag_name ?? '').replace(/^v/, '');
      if (!latest) return { current: this.currentVersion, checked: false, error: 'GitHub returned no release tag' };
      return {
        current: this.currentVersion, checked: true, latest,
        updateAvailable: isNewer(latest, this.currentVersion),
        releaseUrl: data.html_url, publishedAt: data.published_at,
      };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.debug({ event: 'update_check.failed', error: msg });
      return { current: this.currentVersion, checked: false, error: 'Could not reach GitHub (no internet, or it is blocked here).' };
    }
  }
}

@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('update-check')
  updateCheck() {
    return this.system.updateCheck();
  }
}

@Module({ controllers: [SystemController], providers: [SystemService] })
export class SystemModule {}
