import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const secret = z
  .string()
  .min(32, 'must be at least 32 characters (run pnpm env:setup --add-missing)');
const booleanFlag = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
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
  /** Set to true only behind a trusted reverse proxy / tunnel (Phase 11). */
  TRUST_PROXY: booleanFlag.default(false),
});
export type Env = z.infer<typeof EnvSchema>;

/** Validates env vars. Error messages name the variable but never echo its value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration (check .env): ${problems}`);
  }
  return result.data;
}

/** Path of the single .env at the repo root. */
export const ROOT_ENV_PATH = fileURLToPath(new URL('../../../../.env', import.meta.url));

/** Loads the repo-root .env (if present; real env vars win) and validates it. */
export function loadEnv(): Env {
  if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
  return parseEnv(process.env);
}
