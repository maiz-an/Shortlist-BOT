import { LoggerService } from '@nestjs/common';

const SENSITIVE = /token|password|secret|authorization|api[-_]?key|cookie/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/** Structured (one JSON object per line) logger with sensitive-key redaction. */
export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, params: unknown[]) {
    const context = typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level, context };
    if (message && typeof message === 'object') Object.assign(entry, redact(message) as object);
    else entry.msg = message;
    if (params.length) entry.extra = redact(params);
    const line = JSON.stringify(entry);
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  }
  log(m: unknown, ...p: unknown[]) {
    this.write('info', m, p);
  }
  error(m: unknown, ...p: unknown[]) {
    this.write('error', m, p);
  }
  warn(m: unknown, ...p: unknown[]) {
    this.write('warn', m, p);
  }
  debug(m: unknown, ...p: unknown[]) {
    this.write('debug', m, p);
  }
  verbose(m: unknown, ...p: unknown[]) {
    this.write('debug', m, p);
  }
}
