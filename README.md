# Leaders Key Workforce System

Internal tool for Leaders Key: the owner assigns and tracks work for employees, with a local LLM (Ollama) and a desktop agent. Specs live in [docs/](docs/); start with [START_HERE.md](START_HERE.md).

## Quick start

Prerequisites: Node.js 22+, pnpm 10, Docker Desktop (running), Git.

```bash
pnpm install              # installs everything and generates the Prisma client
pnpm env:setup            # creates .env from .env.example with random secrets (never commit .env)
docker compose up -d db   # PostgreSQL 16 on localhost:5434
pnpm db:migrate           # applies database migrations
# Set your real OWNER_EMAIL and a strong OWNER_PASSWORD in .env first (seed never changes them later)
pnpm db:seed              # six job roles + the owner account; safe to run again
pnpm dev                  # API on http://localhost:4000, web on http://localhost:5173
```

Open http://localhost:5173. The status page should show **Server: OK** and **Database: OK**.

After pulling a change that adds new keys to `.env.example`, run `pnpm env:setup --add-missing`. It appends only the missing keys, generates random secrets for them and never prints values.

## Tests

`pnpm test` needs the Docker database running (`docker compose up -d db`). Server tests use a separate database `<POSTGRES_DB>_test` on the same server, created and migrated automatically. Your dev data is never touched.

## Trying the API with curl (Phases 1-2)

There is no UI for this yet (Phase 3). In Git Bash, from the repo root:

```bash
API=http://localhost:4000/api/v1
# 1. Owner login (use your OWNER_EMAIL / OWNER_PASSWORD from .env)
OWNER=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"YOUR_OWNER_PASSWORD"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')
# 2. Invite code (shown once, valid 10 minutes)
curl -s -X POST $API/codes/invite -H "authorization: Bearer $OWNER" -H 'content-type: application/json' \
  -d '{"deviceMode":"PERSONAL","note":"test employee"}'
# 3. Claim it (any wrong, expired, revoked or used code gives the same error)
curl -s -X POST $API/register/claim -H 'content-type: application/json' -d '{"code":"XXXX-XXXX"}'
# 4. Pending invites, and revoke one
curl -s $API/codes -H "authorization: Bearer $OWNER"
curl -s -X DELETE $API/codes/<id> -H "authorization: Bearer $OWNER"
# 5. Job roles (for jobRoleId) and consent version
curl -s $API/job-roles -H "authorization: Bearer $OWNER"
curl -s $API/register/consent
# 6. Finish registration with the registrationToken from step 3
curl -s -X POST $API/register/complete -H 'content-type: application/json' -d '{
  "token":"<registrationToken>","name":"Test Employee","email":"test.employee@example.com",
  "password":"Mango-River-Lamp-73","jobRoleId":"<id>","phone":"+91 98765 43210",
  "emergencyContactName":"Someone","emergencyContactPhone":"+91 91234 56789",
  "consentAccepted":true,"consentVersion":"2026-10-v2"}'
```

### Sessions and hours (Phase 2)

```bash
# Employee login (access tokens last 15 minutes; log in again if you get 401)
EMP=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"test.employee@example.com","password":"Mango-River-Lamp-73"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')
# Start (calling it twice returns the same session), current, stop (break), start again (resume)
curl -s -X POST $API/sessions/start -H "authorization: Bearer $EMP"
curl -s $API/sessions/current -H "authorization: Bearer $EMP"
curl -s -X POST $API/sessions/stop -H "authorization: Bearer $EMP"
# Agent heartbeat (the desktop agent sends these every 30 s from Phase 8)
curl -s -X POST $API/agent/heartbeat -H "authorization: Bearer $EMP" -H 'content-type: application/json' \
  -d "{\"heartbeats\":[{\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"state\":\"ACTIVE\"}]}"
# Hours: today + month for yourself; the owner must add ?userId=<employee id>
curl -s $API/reports/hours/today -H "authorization: Bearer $EMP"
curl -s "$API/reports/hours?month=2026-10" -H "authorization: Bearer $EMP"
curl -s "$API/reports/hours?userId=<employee id>&month=2026-10" -H "authorization: Bearer $OWNER"
```

Once a session has had a heartbeat, it closes itself 3 minutes (`SESSION_AUTOCLOSE_AFTER_SEC`) after the last one. A session with no heartbeat at all closes after 12 hours (`SESSION_NO_HEARTBEAT_MAX_HOURS`), and the report flags that day.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Server (auto-restarts on change) and web app together |
| `pnpm agent:dev` | Desktop agent (placeholder until Phase 8) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks. Run all three before calling a task done |
| `pnpm --filter server test` | Tests for one package |
| `pnpm db:migrate` / `pnpm db:seed` | Prisma migrations / seed data |
| `pnpm format` | Format all files with Prettier |

## Layout

```
apps/server     Fastify + Prisma API (routes -> services -> repositories)
apps/web        React + Vite + Tailwind (owner and employee dashboards)
apps/agent      Electron desktop agent (placeholder until Phase 8)
packages/shared Zod schemas and types shared by all apps
scripts/        Ops scripts
```

## Ports

| Port | Service |
|---|---|
| 4000 | API server (`GET /api/v1/health`) |
| 5173 | Web app (Vite dev server; proxies `/api` to 4000) |
| 5434 | PostgreSQL in Docker (bound to 127.0.0.1 only). Change `DB_PORT` and the port in `DATABASE_URL` in `.env` if it is taken |

## Troubleshooting

- **Database: Down** on the status page: start Docker Desktop, then `docker compose up -d db`.
- **`ports are not available` / `port is already allocated`** when starting the db: another PostgreSQL uses that port. Pick a free one for `DB_PORT` in `.env` and use the same port in `DATABASE_URL`.
- **Port 4000 or 5173 already in use** after a crash: an old dev process is still running. Close the old terminal, or on Windows find it with `netstat -ano | findstr :4000` and stop it with `taskkill /PID <pid> /F`.
- **`Invalid environment configuration`** when the server starts: `.env` is missing or a value is wrong. The message names the variable. After an update, run `pnpm env:setup --add-missing`.
- **`Cannot reach PostgreSQL for tests`**: start the database with `docker compose up -d db`.
- **`Too many attempts`** (429) on claim or login: 5 wrong codes or 10 wrong logins from one address in 15 minutes. Wait 15 minutes, or restart the server in development (the counter is in memory).
