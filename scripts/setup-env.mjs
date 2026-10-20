// Creates .env from .env.example and replaces every "change-me..." placeholder with a random value.
// Never prints secret values, only the names of the keys it generated.
// Usage: pnpm env:setup                 (refuses to overwrite an existing .env)
//        pnpm env:setup --add-missing   (appends keys that are in .env.example but not in .env)
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(root, '.env.example');
const envPath = join(root, '.env');
const addMissing = process.argv.includes('--add-missing');

// FACE_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars) for AES-256-GCM.
const byteLength = { FACE_ENCRYPTION_KEY: 32, POSTGRES_PASSWORD: 24, OWNER_PASSWORD: 12 };

const lineRe = /^([A-Z0-9_]+)=(\S*)(.*)$/;

/** Web Push (VAPID) needs a P-256 key pair: public = uncompressed point, private = d (base64url). */
let vapidPair;
function vapidKeys() {
  if (!vapidPair) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });
    const point = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, 'base64url'),
      Buffer.from(jwk.y, 'base64url'),
    ]);
    vapidPair = { VAPID_PUBLIC_KEY: point.toString('base64url'), VAPID_PRIVATE_KEY: jwk.d };
  }
  return vapidPair;
}

/** Placeholder -> random hex (or a VAPID key); everything else is kept. */
function resolveValue(key, value, generated) {
  if (value.startsWith('change-me') && key in { VAPID_PUBLIC_KEY: 1, VAPID_PRIVATE_KEY: 1 }) {
    generated.push(key);
    return vapidKeys()[key];
  }
  if (value.startsWith('change-me') && key !== 'DATABASE_URL') {
    generated.push(key);
    return randomBytes(byteLength[key] ?? 32).toString('hex');
  }
  return value;
}

const exampleLines = readFileSync(examplePath, 'utf8').split(/\r?\n/);

if (addMissing) {
  if (!existsSync(envPath)) {
    console.log('.env does not exist yet. Run "pnpm env:setup" first.');
    process.exit(1);
  }
  const present = new Set(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => lineRe.exec(line)?.[1])
      .filter(Boolean),
  );
  const generated = [];
  const added = [];
  for (const line of exampleLines) {
    const m = lineRe.exec(line);
    if (!m || present.has(m[1])) continue;
    const [, key, value, rest] = m;
    // The two VAPID keys belong together: never pair a new key with an old one.
    const partner = {
      VAPID_PUBLIC_KEY: 'VAPID_PRIVATE_KEY',
      VAPID_PRIVATE_KEY: 'VAPID_PUBLIC_KEY',
    }[key];
    if (partner && present.has(partner)) {
      added.push(`${key}=${rest}`);
      console.log(
        `${key} added empty: .env already has ${partner}. Set both keys yourself, or delete both and run this again.`,
      );
      continue;
    }
    added.push(`${key}=${resolveValue(key, value, generated)}${rest}`);
  }
  if (added.length === 0) {
    console.log('.env already has every key from .env.example. Nothing changed.');
    process.exit(0);
  }
  const current = readFileSync(envPath, 'utf8');
  const separator = current.endsWith('\n') || current === '' ? '' : '\n';
  appendFileSync(
    envPath,
    `${separator}\n# Added by pnpm env:setup --add-missing\n${added.join('\n')}\n`,
  );
  console.log(`Added ${added.length} key(s): ${added.map((l) => l.split('=')[0]).join(', ')}`);
  console.log(`Generated random values for: ${generated.join(', ') || '(none)'}`);
  process.exit(0);
}

if (existsSync(envPath)) {
  console.log(
    '.env already exists. Nothing changed. Use "pnpm env:setup --add-missing" to add new keys.',
  );
  process.exit(0);
}

const values = new Map();
const generated = [];

const lines = exampleLines.map((line) => {
  const m = lineRe.exec(line);
  if (!m) return line;
  const [, key, value, rest] = m;
  const next = resolveValue(key, value, generated);
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
