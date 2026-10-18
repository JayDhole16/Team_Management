# Leaders Key Workforce System

Internal tool for Leaders Key: the owner assigns and tracks work for employees, with a local LLM (Ollama) and a desktop agent. Specs live in [docs/](docs/); start with [START_HERE.md](START_HERE.md).

## Quick start

Prerequisites: Node.js 22+, pnpm 10, Docker Desktop (running), Git.

```bash
pnpm install              # installs everything and generates the Prisma client
pnpm env:setup            # creates .env from .env.example with random secrets (never commit .env)
docker compose up -d db   # PostgreSQL 16 on localhost:5434
pnpm db:migrate           # applies database migrations
pnpm dev                  # API on http://localhost:4000, web on http://localhost:5173
```

Open http://localhost:5173. The status page should show **Server: OK** and **Database: OK**.

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
- **`Invalid environment configuration`** when the server starts: `.env` is missing or a value is wrong. The message names the variable.
