import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, AIRuntimeDetails, AIUnavailableError, GenerateOptions } from './ai-provider';

@Injectable()
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.get<string>('OLLAMA_MODEL', 'qwen3:8b');
    this.timeoutMs = Number(config.get('OLLAMA_TIMEOUT_MS', 180000));
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { ok: false, detail: `Ollama responded ${res.status}` };
      const data = (await res.json()) as { models?: { name: string }[] };
      const has = data.models?.some((m) => m.name === this.model || m.name.startsWith(`${this.model}:`));
      return has ? { ok: true } : { ok: false, detail: `Model ${this.model} not pulled (run: ollama pull ${this.model})` };
    } catch (err) {
      return { ok: false, detail: `Ollama unreachable at ${this.baseUrl}: ${(err as Error).message}` };
    }
  }

  async details(): Promise<AIRuntimeDetails> {
    const started = Date.now();
    try {
      const [v, ps] = await Promise.all([
        fetch(`${this.baseUrl}/api/version`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${this.baseUrl}/api/ps`, { signal: AbortSignal.timeout(4000) }),
      ]);
      const version = v.ok ? ((await v.json()) as { version?: string }).version : undefined;
      const loaded = ps.ok
        ? (((await ps.json()) as { models?: { name: string; size: number; expires_at?: string }[] }).models ?? []).map((m) => ({
            name: m.name, sizeMb: Math.round(m.size / 1048576), expiresAt: m.expires_at,
          }))
        : [];
      return { reachable: v.ok, latencyMs: Date.now() - started, version, loaded };
    } catch {
      return { reachable: false, latencyMs: null };
    }
  }

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    const messages = [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ];
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          think: false, // skip qwen3 reasoning traces; we want the answer only
          ...(opts.json ? { format: 'json' } : {}),
          options: { temperature: opts.temperature ?? 0.2 },
        }),
      });
    } catch (err) {
      const e = err as Error;
      const msg = e.name === 'TimeoutError' ? 'Ollama request timed out' : `Ollama unreachable: ${e.message}`;
      this.logger.warn({ event: 'ai.unavailable', reason: msg });
      throw new AIUnavailableError(msg, err);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AIUnavailableError(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return (data.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
}
