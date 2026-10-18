---
description: Run typecheck, lint and all tests, then report a clear pass/fail summary
disable-model-invocation: true
---

Run these in order and report the result of each: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

If the app is runnable, also start it with `pnpm dev`, hit `GET /api/v1/health` with curl, and stop it again.

Report a compact table: check, PASS/FAIL, and for failures the file:line and the first useful error line. Do not modify any code unless I ask you to; just diagnose. End with the single most important thing to fix first.
