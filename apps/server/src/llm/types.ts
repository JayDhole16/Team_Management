import type { AiHealth } from '@lk/shared';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A JSON schema object sent to Ollama as `format` (structured output). */
export type JsonSchema = Record<string, unknown>;

export interface LlmChatRequest {
  messages: LlmMessage[];
  format: JsonSchema;
  /** Cap on generated tokens, so a looping model cannot run until the timeout. */
  numPredict: number;
  signal?: AbortSignal;
}

export interface LlmChatResult {
  /** The raw answer text. Untrusted: the pipelines parse and validate it. */
  content: string;
  model: string;
  /** The model hit the token cap, so the answer is incomplete (usually broken JSON). */
  truncated: boolean;
}

/** Injectable so tests use a mock and never touch a real Ollama. */
export interface LlmClient {
  readonly model: string;
  chat(request: LlmChatRequest): Promise<LlmChatResult>;
  /** Never throws: reports `down` instead. */
  health(): Promise<AiHealth>;
}

export type LlmErrorKind =
  /** Ollama cannot be reached (not running, wrong URL). */
  | 'unavailable'
  | 'timeout'
  /** OLLAMA_MODEL is not pulled on this machine. */
  | 'model_missing'
  /** Ollama answered with an error status or an unexpected body. */
  | 'bad_response'
  /** The answer was not valid JSON for the schema, twice. */
  | 'bad_output';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    /** Zod issue paths only (never the model's text), for logs. */
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
