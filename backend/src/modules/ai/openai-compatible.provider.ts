import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, AIRuntimeDetails, AIUnavailableError, GenerateOptions } from './ai-provider';

/**
 * Talks to any AI API that speaks the OpenAI chat-completions format: OpenAI itself, OpenRouter,
 * Groq, Together.ai, Fireworks, DeepSeek, a local llama.cpp/LM Studio server, and most others -
 * just point AI_API_BASE_URL at it. Used when AI_PROVIDER=openai instead of the default, Ollama.
 */
@Injectable()
export class OpenAiCompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('AI_API_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '');
    this.apiKey = config.get<string>('AI_API_KEY', '');
    this.model = config.get<string>('AI_API_MODEL', '');
    this.timeoutMs = Number(config.get('AI_API_TIMEOUT_MS', 120000));
  }

  async isAvailable() {
    if (!this.apiKey) return { ok: false, detail: 'AI_API_KEY is not set in backend/.env' };
    if (!this.model) return { ok: false, detail: 'AI_API_MODEL is not set in backend/.env' };
    try {
      // Not every OpenAI-compatible host implements GET /models, so a non-2xx that still means
      // "I heard you and rejected the request" (401/403/404) is treated as reachable; only a
      // network-level failure counts as unavailable.
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, detail: `${this.baseUrl} rejected the API key (HTTP ${res.status})` };
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: `Could not reach ${this.baseUrl}: ${(err as Error).message}` };
    }
  }

  async details(): Promise<AIRuntimeDetails> {
    const started = Date.now();
    const status = await this.isAvailable();
    return { reachable: status.ok, latencyMs: status.ok ? Date.now() - started : null };
  }

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    if (!this.apiKey) throw new AIUnavailableError('AI_API_KEY is not set in backend/.env');
    if (!this.model) throw new AIUnavailableError('AI_API_MODEL is not set in backend/.env');
    const messages = [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ];
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (err) {
      const e = err as Error;
      const msg = e.name === 'TimeoutError' ? `${this.name} request timed out` : `${this.baseUrl} unreachable: ${e.message}`;
      this.logger.warn({ event: 'ai.unavailable', reason: msg });
      throw new AIUnavailableError(msg, err);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AIUnavailableError(`${this.baseUrl} error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  }
}
