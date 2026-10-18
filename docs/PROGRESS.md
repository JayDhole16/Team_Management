# Progress Log

Update this at the end of every phase (the `/phase` command does it).

| Phase | Title | Status | Date | Notes |
|---|---|---|---|---|
| 0 | Bootstrap monorepo | done | 2026-10-18 | pnpm monorepo, Postgres 16 in Docker, Prisma empty migration, /api/v1/health + status page. See "Phase 0" below. |
| 1 | Auth, invite codes, registration API | done | 2026-10-18 | Login/refresh/RBAC, access codes, atomic registration, employee admin, recovery codes. See "Phase 1" below. |
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

## Phase 1 — Auth, invite codes, registration API (done 2026-10-18)
**Built**
- Prisma models (migration `20261018131815_auth_registration`): users, job_roles, devices (table only), access_codes, refresh_tokens, consent_records, audit_log.
- Auth: argon2id (OWASP params), 15-min HS256 access token (`jose`), 30-day rotating refresh token in an httpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`, stored only as an HMAC. Reusing a revoked refresh token ends all of that user's sessions. Login: same error for unknown email and wrong password (with timing equalised); 10 failures per IP in 15 min gives 429.
- RBAC (`plugins/auth.ts`): every route must declare `config.auth` (startup fails otherwise). The user is re-read on every request, so deactivation and role changes apply immediately.
- Access codes: 8 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, rejection-sampled `crypto.randomBytes`, stored as HMAC-SHA256 (`CODE_HASH_SECRET`), shown once as `XXXX-XXXX`. INVITE (device mode required, optional preset role and note), PASSWORD_RESET and FACE_RESCAN (tied to one active employee). List (open codes plus the last 24 h, status computed from time), revoke, and an expiry job every 60 s.
- Claim: an atomic ACTIVE→CLAIMED update (two tabs: exactly one wins), registration token valid for `REGISTRATION_WINDOW_MIN` (30). One generic `INVALID_CODE` response for every failure. 5 failures per IP in 15 min gives 429; a global cap (`CLAIM_GLOBAL_FAILURE_CAP`, 50) pauses claims for everyone. Hitting either limit writes one aggregated audit row and emits `security:alert`.
- `POST /register/complete`: strict Zod (rejects `deviceMode` and any unknown field), one transaction (CLAIMED→USED guard, user, encrypted face template if sent, consent, audit), device mode always taken from the code, idempotent retry, 409 EMAIL_TAKEN. It emits `employee:registered` with the new employee's details.
- Employees (owner): list (role/status filter), get, PATCH (job role, device mode, idle interval 5-120, joining date; changes audited before→after), deactivate (blocks login, revokes refresh tokens and open codes, deletes the face template), reactivate. Job roles: GET (signed in), POST (owner).
- Recovery: `POST /auth/password-reset/complete` (email + code + new password; revokes all sessions), `POST /me/face-template` (FACE_RESCAN code). Both use the same generic error and limiter as claim.
- Shared: schemas for auth, codes, register, employees, password policy (10-128 chars, common-password list, must not contain the email name), and the consent text and version (draft).
- Seed: six job roles (upsert) plus the owner from `.env`. Never overwrites an existing owner's password, never creates a second owner, refuses placeholder or weak passwords without echoing them.
- `pnpm env:setup --add-missing` appends new `.env.example` keys to an existing `.env` (secrets generated, values never printed).
- Tests: 123 server (15 files: lib units, RBAC on every owner route, code lifecycle, rate limits, atomic/idempotent/racing registration, auth, employees, recovery, seed, no secrets in logs/responses), 22 shared, plus the existing web/agent tests.
- Security review (security-reviewer agent) found no Critical or High issues. Fixed: per-account login lock (10 failures per email in 15 min, audit + alert); separate limiters for invite claims and recovery codes (the global cap applies to claims only); invalid JSON or a wrong content type on claim now gets the generic error and counts as a failure; refresh-token reuse is audited and alerted; the refresh cookie is Secure in production or whenever the request is HTTPS; Prisma errors are logged by name/code only; face templates use the user id as AES-GCM associated data; the unknown-email path of password reset does equal work.

**Deviations from the plan**
- Migration folder is the Prisma default `20261018131815_auth_registration`, not `1_auth_registration`.
- New, not in ARCHITECTURE §4: `refresh_tokens` table; `access_codes.registered_user_id` (idempotent complete); user columns `emergency_contact_name`, `emergency_contact_phone`, `joining_date`, `updated_at` (PRD Q15). `phone` and the emergency contact are nullable in the DB (the owner has none) but required by the register API.
- Events go to an in-process bus (`lib/events.ts`), only logged for now. Socket.IO delivery to the owner (toast, security alert) comes in Phase 3/7.
- Deactivation cannot close work sessions yet (they arrive in Phase 2); Phase 2 must add that to `deactivateEmployee`.
- Duplicate-face check is a marked placeholder in `registration.service.ts` and `face-template.service.ts` (Phase 9).
- Helmet/CORS not added (web uses the Vite proxy, same origin); revisit in Phase 12.
- Rate-limit counters are in memory (single server process); they reset on restart. The per-account login lock means someone could keep the owner locked out by guessing wrong (alerted). Acceptable for now; revisit in Phase 12 if it happens.
- Open from the security review (later phases): access tokens stay valid up to 15 min after logout or password reset (add `sessions_valid_after` with the agent device tokens in Phase 8); `TRUST_PROXY` should become a hop count / proxy IP list and the server should bind to 127.0.0.1 behind the tunnel (Phase 11).
- `pnpm test` now needs the Docker DB running (decided 2026-10-18).
- New dependencies: `argon2`, `jose`, `@fastify/cookie` (server).

## Decisions
(Record decisions made with the client, e.g. answers to PRD open questions.)
Answers are recorded inline in docs/PRD.md section 5 (committed 2026-10-18). The ones that affect the build:
- Q1: idle time is not deducted; show total logged hours and idle time separately.
- Q2: 16 employees now.
- Q3: client GPU is an RTX 3050 with 4 GB VRAM.
- Q4: initial allowlist: Antigravity, Docker, GitHub, VS Code, Render, MongoDB, ChatGPT, Claude, Groq, Vercel, Hostinger, Railway, Excel.
- Q5: no MDM.
- Q6: employees also sign a paper consent form. The in-app consent text (`packages/shared/src/schemas/consent.ts`) is a draft until the client sends wording.
- Q7: renders, exports and similar work count as background activity.
- Q8: not answered; default English.
- Q9: no target hours; show work days/hours.
- Q10, Q18: Cloudflare Tunnel; client is OK with Cloudflare's edge.
- Q11: registration window is 30 min.
- Q12: no owner approval. The owner gets a notification with the new employee's details.
- Q13: client wants a stored profile photo. **This conflicts with CLAUDE.md rule 1 (never store images). Unresolved; decide before Phase 9.**
- Q14: not answered; default: the employee picks a role unless the owner preset one (then it is locked).
- Q15 (detail decided 2026-10-18): phone and emergency contact (name + phone) are required at registration. Joining date is owner-only and defaults to the registration date.
- Q16: (R) items in scope: password-reset and face-rescan codes, duplicate-face check, audit log.
- Q17: GPU PC runs Windows, on during office hours only.
- Q19: phone push alerts wanted.
- Q20: "do whatever is best": standard (non-admin) macOS accounts for company MacBook users.

## Manual checks pending
(Things a human must verify on real devices.)
- [ ] Phase 0: open http://localhost:5173 after `pnpm dev`. The page shows Server: OK and Database: OK. Then run `docker compose stop db`; within 10 s it should show Database: Down with the Docker hint. Run `docker compose start db` afterwards.
- [ ] Phase 0: open `.env` yourself and note OWNER_PASSWORD (generated; used by the Phase 1 seed). Never share `.env`.
- [ ] Phase 0: create the private GitHub/GitLab repo and `git push -u origin main`.
- [x] Before Phase 1: get the client's answers to docs/PRD.md section 5 (at least 1, 3, 5, 11-18) and write them under Decisions.
- [ ] Phase 1: put your real OWNER_EMAIL and a strong OWNER_PASSWORD (10+ chars, not common, must not contain the email name) in `.env`, THEN run `pnpm db:seed` twice. The second run must say "Owner account already exists". Seed never changes the owner later, so get the email right first.
- [ ] Phase 1: by hand with curl (README "Trying the API with curl"): a wrong code, an expired code (wait 10 min), a revoked code and a reused code all return the same "This code is invalid or has expired" message; complete a registration and log in as that employee; `GET /api/v1/employees` with the employee token returns 403.
- [ ] Phase 1: decide PRD Q13 (profile photo) vs CLAUDE.md rule 1 before Phase 9.
- [ ] Phase 1: send the client the draft consent text (`packages/shared/src/schemas/consent.ts`) for approval (PRD Q6).
- [ ] Phase 11: behind Cloudflare Tunnel, set `TRUST_PROXY=true` and use the real client IP (CF-Connecting-IP); otherwise every request looks like one IP and the per-IP limits act globally.
