export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface GenerateOptions {
  system?: string;
  /** Ask the model for a JSON object response. */
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
}

export class AIUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}

export interface AIRuntimeDetails {
  reachable: boolean;
  latencyMs: number | null;
  version?: string;
  /** Models currently held in memory by the provider (local providers only). */
  loaded?: { name: string; sizeMb: number; expiresAt?: string }[];
}

/** Provider-agnostic LLM interface. Business code depends only on this. */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  isAvailable(): Promise<{ ok: boolean; detail?: string }>;
  generate(prompt: string, opts?: GenerateOptions): Promise<string>;
  /** Optional runtime info for the health page. */
  details?(): Promise<AIRuntimeDetails>;
}
