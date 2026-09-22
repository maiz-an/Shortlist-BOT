import { ConfigService } from '@nestjs/config';
import { AIUnavailableError } from '../modules/ai/ai-provider';
import { OpenAiCompatibleProvider } from '../modules/ai/openai-compatible.provider';

// Importing anything that pulls in @prisma/client loads backend/.env as an import side effect,
// which could otherwise leak a real AI_API_KEY/AI_API_BASE_URL into these tests.
beforeEach(() => {
  delete process.env.AI_API_KEY;
  delete process.env.AI_API_BASE_URL;
  delete process.env.AI_API_MODEL;
});

function build(env: Record<string, string> = {}) {
  return new OpenAiCompatibleProvider(new ConfigService(env));
}

describe('OpenAiCompatibleProvider', () => {
  it('reports not configured with no API key, and never calls the network', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const p = build({ AI_API_MODEL: 'gpt-4o-mini' });
    const status = await p.isAvailable();
    expect(status).toEqual({ ok: false, detail: 'AI_API_KEY is not set in backend/.env' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('reports not configured with no model set', async () => {
    const p = build({ AI_API_KEY: 'sk-x' });
    expect(await p.isAvailable()).toEqual({ ok: false, detail: 'AI_API_MODEL is not set in backend/.env' });
  });

  it('is available when the models endpoint responds', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    const p = build({ AI_API_KEY: 'sk-x', AI_API_MODEL: 'gpt-4o-mini' });
    expect(await p.isAvailable()).toEqual({ ok: true });
    fetchSpy.mockRestore();
  });

  it('treats a rejected API key as unavailable, but a 404 (endpoint not implemented) as reachable', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    const p = build({ AI_API_KEY: 'bad-key', AI_API_MODEL: 'gpt-4o-mini' });
    expect((await p.isAvailable()).ok).toBe(false);

    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    expect((await p.isAvailable()).ok).toBe(true);
    fetchSpy.mockRestore();
  });

  it('reports unreachable without throwing when the network fails', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const p = build({ AI_API_KEY: 'sk-x', AI_API_MODEL: 'gpt-4o-mini', AI_API_BASE_URL: 'https://example.invalid/v1' });
    const status = await p.isAvailable();
    expect(status.ok).toBe(false);
    expect(status.detail).toContain('example.invalid');
    fetchSpy.mockRestore();
  });

  it('sends chat-completions requests and returns the message content', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: '  hello  ' } }] }),
    } as Response);
    const p = build({ AI_API_KEY: 'sk-x', AI_API_MODEL: 'gpt-4o-mini' });
    const out = await p.generate('hi');
    expect(out).toBe('hello');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-x' });
    fetchSpy.mockRestore();
  });

  it('throws AIUnavailableError without a key, and on a non-ok response', async () => {
    await expect(build({ AI_API_MODEL: 'm' }).generate('hi')).rejects.toThrow(AIUnavailableError);

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as Response);
    await expect(build({ AI_API_KEY: 'k', AI_API_MODEL: 'm' }).generate('hi')).rejects.toThrow(AIUnavailableError);
    fetchSpy.mockRestore();
  });
});
