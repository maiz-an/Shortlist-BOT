import { z } from 'zod';

export class InvalidAIOutputError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'InvalidAIOutputError';
  }
}

/** Pulls the first balanced JSON object out of arbitrary model text (handles fences / chatter). */
export function extractJson(raw: string): unknown {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  if (start === -1) throw new InvalidAIOutputError('No JSON object found', raw);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch (e) {
        throw new InvalidAIOutputError(`Malformed JSON: ${(e as Error).message}`, raw);
      }
    }
  }
  throw new InvalidAIOutputError('Unterminated JSON object', raw);
}

/** Strictly validates model output against a schema; never trusts unvalidated JSON. */
export function parseAIOutput<T extends z.ZodTypeAny>(raw: string, schema: T): z.infer<T> {
  const json = extractJson(raw);
  const result = schema.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new InvalidAIOutputError(`Schema validation failed: ${detail}`, raw);
  }
  return result.data;
}
