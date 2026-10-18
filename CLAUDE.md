# Leaders Key Workforce System

Internal system for Leaders Key. The owner assigns and tracks work for employees (editors, graphic designers, developers) using a **local LLM (Ollama)**. A desktop agent tracks work hours and idleness, and on company MacBooks restricts apps/websites.

Deep docs (read only the one you need; do not load all of them):
- docs/PRD.md — requirements with IDs (O-1, E-2, A-4 ...) and open questions
- docs/ARCHITECTURE.md — stack, data model, API, agent + LLM design, security
- docs/ONBOARDING_FLOW.md — owner invite code -> employee registration -> face scan (read before touching auth, codes or registration)
- docs/BUILD_PLAN.md — phases 0-12 with acceptance criteria
- docs/SCREENS.md — every page of the owner/employee dashboards and the agent windows
- docs/MANUAL_TASKS.md — what the human must do per phase (tell me at the start and end of each phase)
- docs/DEV_ENVIRONMENT.md — dev laptop (RTX 4050, 6 GB), MacBook for agent tests, model plan, moving to the client's PC
- docs/PROGRESS.md — what is done; update at the end of every phase
- docs/llm-eval-samples.md — Hinglish test inputs for the LLM prompts

## Repo layout (pnpm monorepo)
- apps/server — Fastify + TypeScript + Prisma (PostgreSQL), Socket.IO, Ollama client
- apps/web — React + Vite + TypeScript + Tailwind (owner + employee dashboards)
- apps/agent — Electron + TypeScript desktop agent (macOS + Windows)
- packages/shared — Zod schemas and TS types shared by all apps
- scripts/ — ops scripts (db, llm eval, mac proxy reset)

## Commands (created in Phase 0 — keep them working)
- pnpm install · pnpm dev (server + web) · pnpm agent:dev
- pnpm typecheck · pnpm lint · pnpm test · pnpm --filter server test
- pnpm db:migrate · pnpm db:seed · docker compose up -d db
- Before saying a task is done, run: pnpm typecheck && pnpm lint && pnpm test

## Conventions
- TypeScript strict everywhere. No `any` without a comment saying why.
- Validate every external input with Zod; schemas live in packages/shared.
- REST under /api/v1. Responses are `{ data }` or `{ error: { code, message } }`.
- Server layering: routes -> services -> repositories (Prisma). No Prisma calls in routes.
- Store timestamps in UTC. "Today" and "month" are calculated in Asia/Kolkata.
- The owner dashboard must be usable on a phone (responsive, touch-friendly).
- Conventional commits, e.g. `feat(phase-3): employee list page`.
- Tests live next to the code (Vitest). Pure logic (hours calculation, idle decision) must have unit tests.
- If unsure about a library API, check its current docs instead of guessing.

## Non-negotiable rules
1. Camera frames are processed on the employee's own device only (browser or desktop agent). NEVER store or upload images or video, with ONE exception (PRD Q13): a single profile photo per employee, taken at enrollment or re-scan after the employee has seen it. It is encrypted at rest (AES-256-GCM, like templates), served only by an owner-only endpoint, never logged, replaced on re-scan and deleted on deactivation. Idle/presence checks never upload images: only results (present / match / score) leave the laptop. Show an on-screen indicator whenever the camera is active.
2. Face templates are encrypted at rest (AES-256-GCM, key from env). Never log them.
3. The LLM is local Ollama only. No external AI APIs. LLM output is untrusted: validate against a schema and render as plain text, never as HTML.
4. If the LLM is down the app still works (tasks can be written manually) and shows a clear message.
5. App/website blocking applies ONLY to devices with device_type = company_macbook. Personal devices are never restricted.
6. Enforcement code must have a dry-run mode and an emergency-disable script. Never test enforcement on the developer's own daily account.
7. Secrets live only in .env (gitignored). Never print or commit them.
8. Owner-only endpoints are enforced on the server, not just hidden in the UI.
9. Employees join ONLY through owner-issued access codes: random, stored hashed, single-use, 10-minute expiry, rate-limited, same generic error on every failure. Device mode and other owner-only settings can never be set by the employee.

## Workflow rules
- Work one phase at a time with `/phase <n>`. Do not start the next phase.
- Plan first, then implement. Keep diffs small and focused.
- When a phase is finished: `/verify`, update docs/PROGRESS.md, commit.
- If a requirement is ambiguous, check "Open questions" in docs/PRD.md and ask me. Do not invent business rules.
- Do not add dependencies outside the stack in docs/ARCHITECTURE.md without asking. Justify any new one in one line.
- Do not edit docs/PRD.md or this file unless I ask.
