// Creates .env from .env.example and replaces every "change-me..." placeholder with a random value.
// Never prints secret values, only the names of the keys it generated.
// Usage: pnpm env:setup        (refuses to overwrite an existing .env)
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(root, '.env.example');
const envPath = join(root, '.env');

if (existsSync(envPath)) {
  console.log(
    '.env already exists. Nothing changed. Delete it first if you really want a new one.',
  );
  process.exit(0);
}

// FACE_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars) for AES-256-GCM.
const byteLength = { FACE_ENCRYPTION_KEY: 32, POSTGRES_PASSWORD: 24, OWNER_PASSWORD: 12 };

const lineRe = /^([A-Z0-9_]+)=(\S*)(.*)$/;
const values = new Map();
const generated = [];

const lines = readFileSync(examplePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    const m = lineRe.exec(line);
    if (!m) return line;
    const [, key, value, rest] = m;
    let next = value;
    if (value.startsWith('change-me') && key !== 'DATABASE_URL') {
      next = randomBytes(byteLength[key] ?? 32).toString('hex');
      generated.push(key);
    }
    values.set(key, next);
    return `${key}=${next}${rest}`;
  });

// Keep DATABASE_URL in sync with the docker compose credentials.
const output = lines.map((line) => {
  if (!line.startsWith('DATABASE_URL=')) return line;
  const user = values.get('POSTGRES_USER');
  const password = values.get('POSTGRES_PASSWORD');
  const db = values.get('POSTGRES_DB');
  const port = values.get('DB_PORT') || '5432';
  if (!user || !password || !db) return line;
  return `DATABASE_URL=postgresql://${user}:${password}@localhost:${port}/${db}`;
});

writeFileSync(envPath, output.join('\n'), { mode: 0o600 });
console.log(`Created .env. Generated random values for: ${generated.join(', ') || '(none)'}`);
console.log('Open .env yourself to see OWNER_PASSWORD. Never share or commit .env.');
