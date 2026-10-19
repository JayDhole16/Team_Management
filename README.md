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

Open http://localhost:5173 and log in with your OWNER_EMAIL / OWNER_PASSWORD. http://localhost:5173/status shows **Server: OK** and **Database: OK**.

## Using the web app (Phase 3)

- **Owner:** Overview, Employees (role/status filter, hours today and this month, employee page with settings, reset and re-scan codes, deactivate) and Invites. "Add new employee" asks for the device type and shows a one-time code with a 10-minute countdown. The code is never shown again.
- **New employee:** on the login page, "Register as employee": code, details, consent, face scan (a placeholder until Phase 9), done.
- **Employee:** logging in starts the work session. My Day shows the timer with Stop session (break) and Resume, plus hours today and this month. My hours has the per-day list.
- **Projects and tasks (Phase 5):** Projects -> New project: describe it in your own words, "Generate tasks with AI" (or "Write it by hand"), edit, Save, then Assign each task. Tasks is the board (filters by employee, role, project) with "Direct task". Employees see My tasks (Start, Mark blocked, Complete, Reopen) and a Next task shortcut on My Day.
- **Phone:** below 768 px the menu becomes a bottom tab bar. To try it on a real phone, start the dev server with `LK_TUNNEL=1 pnpm dev` (Git Bash), run `cloudflared tunnel --url http://localhost:5173` and open the https address it prints. This is for testing only: the address changes every run, anyone with it can reach your dev server, so close the tunnel afterwards. Never set `TRUST_PROXY=true` for a quick tunnel.

After pulling a change that adds new keys to `.env.example`, run `pnpm env:setup --add-missing`. It appends only the missing keys, generates random secrets for them and never prints values.

## Tests

`pnpm test` needs the Docker database running (`docker compose up -d db`). Server tests use a separate database `<POSTGRES_DB>_test` on the same server, created and migrated automatically. Your dev data is never touched.

End-to-end tests (Playwright, desktop and 390 px phone): `pnpm test:e2e`. Run `pnpm --filter web exec playwright install chromium` once first. They start their own API on port 4100 and web server on port 5174 against a fresh `<POSTGRES_DB>_e2e` database (re-created every run), so a running `pnpm dev` is not disturbed. Failure traces go to `apps/web/test-results/`; the HTML report is in `apps/web/playwright-report/`.

## Trying the API with curl

The web app covers all of this; curl is handy for debugging. In Git Bash, from the repo root:

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

### AI assistant (Phase 4)

Needs Ollama running with `OLLAMA_MODEL` pulled (see "Local LLM" below). With Ollama stopped, every call returns a clean 503 (`LLM_UNAVAILABLE`), and tasks can still be written by hand.

```bash
curl -s $API/ai/health -H "authorization: Bearer $OWNER"
curl -s -X POST $API/ai/breakdown -H "authorization: Bearer $OWNER" -H 'content-type: application/json'   -d '{"brief":"Instagram ke liye 10 reels banane hain, saath me 3 logo options bhi chahiye."}'
curl -s -X POST $API/ai/translate-task -H "authorization: Bearer $OWNER" -H 'content-type: application/json'   -d '{"text":"Login page pe forgot password kaam nahi kar raha, theek kar do.","jobRoleId":"<job role id>"}'
curl -s -X POST $API/ai/translate-update -H "authorization: Bearer $EMP" -H 'content-type: application/json'   -d '{"text":"Dockerized the API. Blocked on the SSL certificate from the client DNS."}'
```

### Projects and tasks (Phase 5)

Works with Ollama stopped: the owner sends the reviewed (or hand-written) text, the server never calls the AI here.

```bash
# Owner: add a missing job role (there is no screen for it yet)
curl -s -X POST $API/job-roles -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"key":"video_editor","label":"Video Editor"}'
# Owner: save a project with unsent tasks (jobRoleId from GET $API/job-roles, or null)
curl -s -X POST $API/projects -H "authorization: Bearer $OWNER" -H 'content-type: application/json'   -d '{"title":"Footer fixes","summaryTechnical":"Small fixes in the footer.","tasks":[{"title":"Fix footer links","descriptionTechnical":"Three links go to 404.","jobRoleId":null,"priority":"MEDIUM","source":"MANUAL"}]}'
curl -s -X POST $API/tasks/<task id>/assign -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"assigneeId":"<employee id>"}'
curl -s "$API/tasks?status=PENDING" -H "authorization: Bearer $OWNER"   # board; also assigneeId, jobRoleId, projectId
# Employee: own tasks, then Start / Mark blocked (reason required) / Complete
curl -s $API/tasks/mine -H "authorization: Bearer $EMP"
curl -s -X POST $API/tasks/<task id>/status -H "authorization: Bearer $EMP" -H 'content-type: application/json' -d '{"status":"BLOCKED","reason":"Waiting for the logo files"}'
```

## Local LLM (Ollama)

1. Install Ollama from ollama.com, then pull the model set in `OLLAMA_MODEL` (default `qwen3.5:4b`): `ollama pull qwen3.5:4b`.
2. After a request, run `ollama ps`: PROCESSOR must say `100% GPU`. If it does not, close GPU-heavy apps or use a smaller model (`qwen3.5:2b`, `llama3.2:3b`).
3. Run the eval on the samples in docs/llm-eval-samples.md and read the report it writes to `llm-eval-results/`:
   `pnpm llm:eval -- --model qwen3.5:4b --runs 2` (other flags: `--only B1,U2`, `--out <file.md>`, `--language hinglish`).
4. Settings in `.env`: `OLLAMA_MODEL`, `OLLAMA_NUM_CTX` (4096), `OLLAMA_TIMEOUT_MS` (120000), `PLAIN_LANGUAGE` (`english`, or `hinglish`). Changing the model needs no code change; restart the server.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Server (auto-restarts on change) and web app together |
| `pnpm agent:dev` | Desktop agent (placeholder until Phase 8) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks. Run all three before calling a task done |
| `pnpm test:e2e` | Playwright end-to-end tests (needs the Docker db and the Chromium download) |
| `pnpm --filter server test` | Tests for one package |
| `pnpm db:migrate` / `pnpm db:seed` | Prisma migrations / seed data |
| `pnpm llm:eval -- --model <name>` | Runs the LLM eval samples against local Ollama and writes a report |
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
| 4100 / 4101 / 5174 | API / fake Ollama / web started by `pnpm test:e2e` only |
| 5434 | PostgreSQL in Docker (bound to 127.0.0.1 only). Change `DB_PORT` and the port in `DATABASE_URL` in `.env` if it is taken |

## Troubleshooting

- **Database: Down** on the status page: start Docker Desktop, then `docker compose up -d db`.
- **`ports are not available` / `port is already allocated`** when starting the db: another PostgreSQL uses that port. Pick a free one for `DB_PORT` in `.env` and use the same port in `DATABASE_URL`.
- **Port 4000 or 5173 already in use** after a crash: an old dev process is still running. Close the old terminal, or on Windows find it with `netstat -ano | findstr :4000` and stop it with `taskkill /PID <pid> /F`.
- **`Invalid environment configuration`** when the server starts: `.env` is missing or a value is wrong. The message names the variable. After an update, run `pnpm env:setup --add-missing`.
- **`Cannot reach PostgreSQL for tests`**: start the database with `docker compose up -d db`.
- **`Too many attempts`** (429) on claim or login: 5 wrong codes or 10 wrong logins from one address in 15 minutes. Wait 15 minutes, or restart the server in development (the counter is in memory).
