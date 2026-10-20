import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PlainLanguageSchema } from '@lk/shared';
import { z } from 'zod';

const secret = z
  .string()
  .min(32, 'must be at least 32 characters (run pnpm env:setup --add-missing)');
const booleanFlag = z.enum(['true', 'false']).transform((v) => v === 'true');
/** An empty value (e.g. `VAPID_SUBJECT=` in .env) counts as not set. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const base64url = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'must be base64url (run pnpm env:setup --add-missing)')
    .refine((v) => Buffer.from(v, 'base64url').length === bytes, `must be ${bytes} bytes`);

/** Local LLM settings. Exported on its own so scripts/llm-eval.ts can run without DB or JWT secrets. */
export const LlmEnvSchema = z.object({
  OLLAMA_BASE_URL: z.url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).default('qwen3.5:4b'),
  OLLAMA_NUM_CTX: z.coerce.number().int().min(512).max(32768).default(4096),
  /** Budget for one pipeline call, the one retry included. */
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600_000).default(120_000),
  /** Language of owner-facing plain text (PRD Q8: English). */
  PLAIN_LANGUAGE: PlainLanguageSchema.default('english'),
});
export type LlmEnv = z.infer<typeof LlmEnvSchema>;

const EnvSchema = LlmEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),

  JWT_SECRET: secret,
  REFRESH_TOKEN_SECRET: secret,
  CODE_HASH_SECRET: secret,
  FACE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes)'),

  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  REGISTRATION_WINDOW_MIN: z.coerce.number().int().min(5).max(120).default(30),
  FACE_ENROLLMENT_REQUIRED: booleanFlag.default(false),
  CLAIM_GLOBAL_FAILURE_CAP: z.coerce.number().int().min(10).default(50),
  /** A session whose agent goes silent this long is closed at its last heartbeat (PRD: 3 min). */
  SESSION_AUTOCLOSE_AFTER_SEC: z.coerce.number().int().min(60).max(3600).default(180),
  /** A session that never got an agent heartbeat is closed this many hours after it started. */
  SESSION_NO_HEARTBEAT_MAX_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  /** Set to true only behind a trusted reverse proxy / tunnel (Phase 11). */
  TRUST_PROXY: booleanFlag.default(false),
  /** Web Push (PRD O-14). Push is on only when all three are set (pnpm env:setup makes the
   *  keys; the subject is `mailto:<owner email>`). */
  VAPID_PUBLIC_KEY: optional(base64url(65)),
  VAPID_PRIVATE_KEY: optional(base64url(32)),
  VAPID_SUBJECT: optional(
    z.string().regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/, 'must be mailto:<email> or an https URL'),
  ),
});
export type Env = z.infer<typeof EnvSchema>;

/** Validates env vars. Error messages name the variable but never echo its value. */
function parseWith<S extends z.ZodType>(schema: S, source: Record<string, string | undefined>) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration (check .env): ${problems}`);
  }
  return result.data as z.infer<S>;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  return parseWith(EnvSchema, source);
}

/** Path of the single .env at the repo root. */
export const ROOT_ENV_PATH = fileURLToPath(new URL('../../../../.env', import.meta.url));

/** Loads the repo-root .env (if present; real env vars win) and validates it. */
export function loadEnv(): Env {
  if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
  return parseEnv(process.env);
}

/** Only the LLM settings (for scripts that do not need the database or secrets). */
export function loadLlmEnv(): LlmEnv {
  if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
  return parseWith(LlmEnvSchema, process.env);
}
