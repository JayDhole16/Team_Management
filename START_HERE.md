# START HERE — Building the Leaders Key system with Claude Code

This kit gives Claude Code everything it needs to build the project phase by phase: project memory (CLAUDE.md), specs, a build plan with prompts, custom commands, subagents and safety permissions.

## The 60-second version
1. This ONE folder is the whole kit. Everything, including the invite-code registration flow (`docs/ONBOARDING_FLOW.md`), is already inside it. You do not attach or paste any file into Claude Code.
2. Install Claude Code, open a terminal in this folder, run `claude`.
3. Press `Shift+Tab` to enter plan mode, type `/phase 0`, read the plan, approve.
4. Repeat for phase 1, 2, 3 ... 12, one phase per fresh session (`/clear` between them).
5. Claude finds and reads the right documents by itself because `CLAUDE.md` and `docs/BUILD_PLAN.md` tell it where to look.

## What is in the kit
```
CLAUDE.md                      Project memory Claude reads every session (rules, commands, conventions)
START_HERE.md                  This guide
.env.example                   Config template (copy to .env, never commit .env)
.gitignore
docs/
  PRD.md                       Requirements with IDs + open questions to ask the client
  ARCHITECTURE.md              Stack, data model, API, idle/face/blocking design, LLM prompts, security
  BUILD_PLAN.md                Phases 0-12, each with a prompt and acceptance criteria
  PROGRESS.md                  Progress log Claude updates after each phase
  ONBOARDING_FLOW.md           Invite code -> register -> face scan (screens, API, security, tests)
  SCREENS.md                   Every page of the owner and employee dashboards and the agent windows
  MANUAL_TASKS.md              What YOU must do, phase by phase (Claude reminds you)
  DEV_ENVIRONMENT.md           Your laptop + MacBook setup, 6 GB model plan, moving to the client's PC
  llm-eval-samples.md          Hinglish test inputs for the LLM
.claude/
  settings.json                Permissions: allows safe commands, asks before sudo/push/installs, blocks risky ones
  rules/                       Extra rules loaded only when Claude touches server / web / agent / llm files
  agents/                      Subagents: code-reviewer, security-reviewer, test-writer
  skills/                      Slash commands: /phase <n>, /verify, /review-phase
scripts/                       (Claude fills this during the build)
```

## How the files fit together (and how Claude uses them)
| File or folder | Who reads it | When |
|---|---|---|
| `CLAUDE.md` | Claude | Automatically at the start of every session. Short: rules, commands, and a list of the docs below. |
| `.claude/rules/*.md` | Claude | Automatically, only when it works on matching files (server, web, agent, LLM code). |
| `.claude/settings.json` | Claude Code itself | Always. Decides what Claude may run without asking and what is blocked. |
| `.claude/skills/*` (`/phase`, `/verify`, `/review-phase`) | You type the command | On demand. `/phase 3` tells Claude exactly what steps to follow. |
| `.claude/agents/*` | Claude (or you with `@name`) | On demand, in a separate context, for reviews and tests. |
| `docs/BUILD_PLAN.md` | Claude | When you run `/phase n`. It reads only that phase. |
| `docs/PRD.md`, `docs/ARCHITECTURE.md` | Claude | When a phase points to them. These are the "what" and the "how". |
| `docs/ONBOARDING_FLOW.md` | Claude | In Phases 1, 3 and 9 (the build plan says "read it first"), and whenever you work on registration, codes or auth. |
| `docs/SCREENS.md` | Claude | In Phases 3, 5 and later whenever it builds pages. Also read it yourself to see what the dashboards will contain. |
| `docs/MANUAL_TASKS.md` | Claude and you | Claude reads it at the start and end of every `/phase` and tells you what you must do. Read it yourself before each phase. |
| `docs/DEV_ENVIRONMENT.md` | Claude and you | Read it once before Phase 0. Claude uses it in Phase 4 (model choice) and Phase 11 (deployment). |
| `docs/PROGRESS.md` | Claude and you | Claude reads it at the start of a phase and updates it at the end. This is how a new session knows what is already done. |
| `docs/llm-eval-samples.md` | Claude | In Phase 4, for LLM testing. |

Reading order for YOU (15 minutes): this file, then `docs/PRD.md`, then `docs/ONBOARDING_FLOW.md`, then skim `docs/BUILD_PLAN.md`. Open them in any text editor; they are plain Markdown.

Why this setup: `CLAUDE.md` is loaded every time, so it stays short. Long details live in `docs/` and are read only when needed. Each session starts fresh, and `docs/PROGRESS.md` is the memory between sessions.

## 1. What you need first
- A Claude account (Pro, Max, Team or Enterprise) or a Claude Console account with API credits. A build this size uses a lot of usage; check `/usage` inside Claude Code now and then.
- Git, Node.js (current LTS), pnpm, Docker Desktop.
- Your laptop (RTX 4050, 6 GB VRAM) with Ollama installed (https://ollama.com); Claude Code tells you what to pull in Phase 4. The client's GPU PC is needed only at deployment.
- A spare Mac or a separate macOS user account for Phase 10 testing. Do NOT test app/website blocking on your own daily account.

## 2. Install Claude Code
macOS, Linux or WSL:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```
Windows PowerShell:
```powershell
irm https://claude.ai/install.ps1 | iex
```
Alternatives: `brew install --cask claude-code` or `winget install Anthropic.ClaudeCode`.

Open a NEW terminal and check it:
```bash
claude --version
```
If the command is not found, the install folder is not on your PATH: see https://code.claude.com/docs/en/troubleshoot-install

## 3. Set up the project
```bash
unzip leaders-key-workforce-kit.zip -d leaders-key-workforce
cd leaders-key-workforce
git init && git add -A && git commit -m "chore: add Claude Code starter kit"
cp .env.example .env        # you will fill real values later
claude
```
On first launch Claude Code asks you to log in (browser). You can re-login later with `/login`.

Do not run `/init`: CLAUDE.md already exists. Instead run `/memory` once to confirm CLAUDE.md is loaded, and type `/` to see your commands (`/phase`, `/verify`, `/review-phase`).

### Your first 10 minutes (exact steps)
```text
cd leaders-key-workforce
claude
```
Then, inside Claude Code:
1. Type `/memory`. You should see `CLAUDE.md` listed as loaded.
2. Optional but recommended, so you and Claude are on the same page. Paste:
   `Read CLAUDE.md, docs/PRD.md and docs/ONBOARDING_FLOW.md. Explain back to me in simple words what we are building, how a new employee joins, and what Phases 0 to 3 will do. Do not write any code.`
   If the explanation matches your understanding, you are ready. If not, correct it now; it is cheap.
3. Type `/clear`.
4. Press `Shift+Tab` until plan mode shows. Type `/phase 0`.
5. Read the plan Claude proposes. Approve it. Wait for the PASS/FAIL report.

## 4. The loop for every phase
1. **Fresh session.** `/clear` (or quit and run `claude` again). One phase per session keeps context clean.
2. **Plan mode.** Press `Shift+Tab` until you see plan mode.
3. **Run the phase.** `/phase 0` (then 1, 2, ... 12). Optionally paste the phase's Prompt from docs/BUILD_PLAN.md after it.
4. **Read the plan.** Check files, tests and any questions. Answer open questions from docs/PRD.md section 5 with the client first. Approve to let it build.
5. **Let it work, then check.** Claude runs typecheck, lint and tests itself and reports PASS/FAIL per acceptance criterion.
6. **`/verify`** for an independent pass/fail table.
7. **`/review-phase`** to run the code-reviewer and security-reviewer subagents. Say "fix the must-fix items".
8. **Test by hand** what the phase says (click through, or use real devices for phases 8-10).
9. **Commit** (Claude already commits; check `git log`). Move on.

Start with Phase 0 today and do not skip ahead: later phases assume earlier ones.

### Where the registration flow (invite code to face scan) gets built
| Phase | What gets built for registration |
|---|---|
| 1 | Backend: access codes (10-minute expiry), claim, registration token, atomic complete, owner endpoints. |
| 3 | Screens: owner "Add new employee" + Pending invites; the employee "Register as employee" wizard (face step is a placeholder). |
| 7 | Owner notification when someone registers; security alerts. |
| 9 | The real face scan step, duplicate-face check, re-scan code. |
| 12 | Full end-to-end test of the flow on real devices. |

Before Phase 1, ask the client the registration questions in `docs/PRD.md` section 5 (numbers 11 to 16) and write the answers in `docs/PROGRESS.md` under "Decisions". Then tell Claude: "Decisions are in PROGRESS.md, read them first."

## 5. Daily commands
| What | How |
|---|---|
| Start | `claude` (in the project folder) |
| Continue yesterday's session | `claude -c` |
| Pick an older session | `claude -r` or `/resume` |
| Clear context | `/clear` |
| Shorten a long session | `/compact` |
| Undo Claude's edits | `/rewind` |
| Switch model | `/model` (use a stronger model for phases 8-10: agent, face, blocking) |
| See usage | `/usage` |
| Why isn't my config working | `/doctor`, `/context`, `/hooks`, `/mcp` |
| Ask a subagent directly | type `@` and pick the agent, e.g. `@security-reviewer check the auth routes` |
| Cycle permission modes | `Shift+Tab` |

## 6. How to talk to Claude Code
- Be specific: "login fails with a blank screen after a wrong password; fix it and add a test" beats "fix login".
- Give it a way to check itself: tests, `pnpm dev`, curl commands. It works much better when it can verify.
- For bugs, paste the exact error text and say what you did.
- If it goes the wrong way, `/rewind` and restate the instruction instead of arguing for ten messages.
- Ask for small steps in risky phases: "do only the app guard in dry-run first".
- Anything ambiguous about client rules: ask the client, write the answer in docs/PROGRESS.md under Decisions, then tell Claude.

## 7. Things Claude Code cannot do for you
The full per-phase list is in `docs/MANUAL_TASKS.md`. Claude reads it at the start and end of every `/phase` and tells you what to do; if it forgets, ask it. Deployment design (GPU PC, Cloudflare Tunnel, home employees) is in `docs/ARCHITECTURE.md` section 11, and what the agent does is in section 13.

- Install Ollama and pull the model on the GPU PC; judge Hinglish quality (Phase 4).
- Test the camera, face matching and permissions on real MacBooks and a Windows laptop (Phases 8-10).
- Approve macOS permission prompts (camera, etc.) and run one-time admin setup steps.
- Mac app signing is free in this kit (ad-hoc signing plus an install script), so no Apple Developer account is needed. You test it on your MacBook in Phase 11.
- MDM subscription if the client wants tamper-proof blocking.
- VPN or tunnel account (Tailscale / Cloudflare) for home employees.
- Get written employee consent for tracking and face verification (India DPDP Act, 2023). Ask a lawyer for the exact wording.
- Final judgment: read the diffs. Claude can be confidently wrong, especially in OS-level code.

## 8. Safety habits for this project
- Phase 10 changes network settings and quits apps. Keep dry-run on until you are on a spare account; keep `scripts/mac-unblock.sh` handy.
- Keep `.env` out of git. settings.json already denies Claude from reading `.env` files.
- Keep Claude in "ask" behaviour for sudo and networksetup commands (already configured).
- Commit after every phase so you can roll back.

## 9. If things go wrong
| Problem | Try |
|---|---|
| `claude: command not found` | Open a new terminal; fix PATH (link above) |
| Commands `/phase` not showing | Run from the project root; type `/` ; run `/doctor` |
| Claude ignores a rule | Keep CLAUDE.md short; move detail to .claude/rules; remind it with "re-read CLAUDE.md rule 5" |
| Session too long and sloppy | `/compact`, or `/clear` and run `/phase <n>` again (PROGRESS.md carries the state) |
| Usage limit reached | Wait for reset, or use a Console/API account, or reduce scope per session |
| Tests keep failing | Ask: "explain the root cause before changing code" |

## 10. Official docs
- Quickstart: https://code.claude.com/docs/en/quickstart
- Best practices: https://code.claude.com/docs/en/best-practices
- Memory / CLAUDE.md: https://code.claude.com/docs/en/memory
- Subagents: https://code.claude.com/docs/en/sub-agents
- Skills / slash commands: https://code.claude.com/docs/en/skills
- Permissions: https://code.claude.com/docs/en/permissions
- The .claude folder: https://code.claude.com/docs/en/claude-directory
