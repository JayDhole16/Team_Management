---
description: Implement one phase from docs/BUILD_PLAN.md (tell me my tasks, plan, build, test, log progress, commit)
disable-model-invocation: true
argument-hint: <phase-number>
---

Implement **Phase $ARGUMENTS** of this project.

1. Read the Phase $ARGUMENTS section of docs/BUILD_PLAN.md, then docs/PROGRESS.md, then the Phase $ARGUMENTS section of docs/MANUAL_TASKS.md, then only the PRD, ARCHITECTURE, SCREENS and ONBOARDING_FLOW sections the phase references.
2. If a previous phase this one depends on is not marked done in docs/PROGRESS.md, stop and tell me.
3. Open your reply with **"Before we start, you need to:"** and list the items for this phase from docs/MANUAL_TASKS.md, in plain words, with exact commands where you can give them. If any [BLOCKER] item is not done, stop and wait for me. If there is nothing, say "Nothing needed from you for this phase."
4. Write a short plan: files to create or change, tests to write, anything else you need from me. If I'm in plan mode, wait for my approval.
5. Implement in small steps. Write tests together with the code. Fix failures as you go.
6. Run `pnpm typecheck && pnpm lint && pnpm test`. Everything must pass.
7. Go through every acceptance criterion of the phase and state PASS or FAIL for each with evidence (test name, command output, or what to click).
8. Update docs/PROGRESS.md: mark the phase done, list what was built, deviations from the plan, and under "Manual checks pending" every item I still need to do.
9. End your final message with a section **"Your turn"**: what I must do or test by hand next, in order (from docs/MANUAL_TASKS.md plus anything new you found).
10. Commit with a conventional message like `feat(phase-$ARGUMENTS): <summary>`.

Do not start the next phase. If something in the phase conflicts with CLAUDE.md or the PRD, stop and ask.
