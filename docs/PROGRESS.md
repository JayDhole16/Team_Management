# Progress Log

Update this at the end of every phase (the `/phase` command does it).

| Phase | Title | Status | Date | Notes |
|---|---|---|---|---|
| 0 | Bootstrap monorepo | done | 2026-10-18 | pnpm monorepo, Postgres 16 in Docker, Prisma empty migration, /api/v1/health + status page. See "Phase 0" below. |
| 1 | Auth, invite codes, registration API | todo | | |
| 2 | Work sessions and hours | todo | | |
| 3 | Web shell, invite UI, registration wizard, timer | todo | | |
| 4 | LLM service | todo | | |
| 5 | Projects and tasks | todo | | |
| 6 | Progress updates | todo | | |
| 7 | Realtime status and alerts | todo | | |
| 8 | Desktop agent core | todo | | |
| 9 | Face scan, idle detection and verification | todo | | |
| 10 | Restricted mode | todo | | |
| 11 | Packaging and deployment | todo | | |
| 12 | Hardening and handover | todo | | |

## Phase 0 — Bootstrap monorepo (done 2026-10-18)
**Built**
- pnpm workspace: `apps/server`, `apps/web`, `apps/agent` (placeholder), `packages/shared` (`@lk/shared`, consumed as TS source, no build step).
- TypeScript strict (`tsconfig.base.json`, plus `noUncheckedIndexedAccess`), ESLint 10 flat config (typescript-eslint strict, react-hooks for web), Prettier, Vitest in every package.
- `docker-compose.yml`: PostgreSQL 16 only, bound to 127.0.0.1, healthcheck, credentials from `.env`.
- Prisma 7.10 in `apps/server`: no models yet, `prisma.config.ts` loads the root `.env`, empty migration `0_init`, no-op seed.
- Server: `config/env.ts` (Zod-validated env, errors name the variable but never its value), `repositories/` (Prisma + `PrismaPg` adapter, `pingDb`), `services/health.service.ts` (3 s timeout), `routes/health.ts`. `GET /api/v1/health` returns 200 `{data:{status:'ok',db:'ok',time}}`, or 503 `{data:{status:'degraded',db:'down',time}}` when the DB is down. 404/500 come back as `{error:{code,message}}`; a 500 never leaks internals. Logger redacts authorization/cookie headers.
- Web: Vite 8 + React 19 + Tailwind 4 + TanStack Query. `api/client.ts` validates the envelope with Zod. The status page (mobile-first, 44 px targets) refetches every 10 s and gives plain-English hints.
- `scripts/setup-env.mjs` (`pnpm env:setup`): creates `.env` from `.env.example` with random secrets and keeps `DATABASE_URL` in sync. Never prints values.
- README with quick start, ports and troubleshooting.
- Tests (21): shared schemas (4), server env/service/route+error envelope (11), web API client (5), agent placeholder (1).

**Deviations from the plan**
- Versions: Prisma pinned to 7.10.1 (npm `latest` is an 8.0 RC). TypeScript 6.0.3, not 7.0 (typescript-eslint supports <6.1).
- Dev server uses `node --watch --import tsx`, not `tsx watch`. `tsx watch` hangs on Windows when pnpm `--parallel` pipes its output (reproduced 3 times); the Node built-in watcher works. `tsx` is the one tool outside ARCHITECTURE.md (dev-time TS runner).
- No server `build` script yet: `start` runs via tsx. A production build/bundle is part of Phase 11 packaging.
- DB host port is `DB_PORT=5434`, not 5432. On the dev laptop, 5432 is taken by a native PostgreSQL 18 service and 5433 by another project's container. `.env.example` gained `HOST`, `LOG_LEVEL`, `POSTGRES_USER/PASSWORD/DB` and `DB_PORT`.
- `.claude/settings.json`: replaced deny `Read(./.env.*)` with specific files (`.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test`, `**/.env`), so `.env.example` is readable. Deny rules beat allow rules, so an allow entry would not have worked.
- Cosmetic: every pnpm command here prints `No projects matched the filters "C:\New folder (2)\..."`. Commands still work. It seems to be a pnpm quirk with the `(2)` in the folder path; it goes away in a path without parentheses (see the fresh-clone check).

## Decisions
(Record decisions made with the client, e.g. answers to PRD open questions.)

## Manual checks pending
(Things a human must verify on real devices.)
- [ ] Phase 0: open http://localhost:5173 after `pnpm dev`. The page shows Server: OK and Database: OK. Then run `docker compose stop db`; within 10 s it should show Database: Down with the Docker hint. Run `docker compose start db` afterwards.
- [ ] Phase 0: open `.env` yourself and note OWNER_PASSWORD (generated; used by the Phase 1 seed). Never share `.env`.
- [ ] Phase 0: create the private GitHub/GitLab repo and `git push -u origin main`.
- [ ] Before Phase 1: get the client's answers to docs/PRD.md section 5 (at least 1, 3, 5, 11-18) and write them under Decisions.
