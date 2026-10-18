# Manual tasks — what only YOU can do, and when

Claude Code writes code and runs commands on the computer it is running on. It cannot use your other computers, create paid accounts, click OS permission prompts, test with real faces, or answer business questions. This is your list, phase by phase.

Tags: [DECISION] ask the client · [SETUP] install or configure · [TEST] check by hand on a real device · [PAID] needs a paid account · [LEGAL] needs legal input · [BLOCKER] the phase cannot finish without it

## How Claude Code tells you
- At the start of every `/phase n`, Claude reads this file and opens its reply with "Before we start, you need to:" listing the items for that phase. It stops if a [BLOCKER] is not done.
- At the end it lists "Your turn" items and copies them to docs/PROGRESS.md under "Manual checks pending".
- If it forgets, type: `What do I have to do myself for phase n? Use docs/MANUAL_TASKS.md.`
- Claude can only tell you; it cannot check that you did them. Tick them off in docs/PROGRESS.md.
- Development happens on YOUR laptop and MacBook (docs/DEV_ENVIRONMENT.md). You do not need Claude Code on the client's PC; Phase 11 produces a deploy/ folder and docs/DEPLOYMENT.md to follow on-site.

## Before Phase 0 (one time)
- [SETUP] Install Git, Node.js LTS, pnpm, Docker Desktop and Claude Code (START_HERE.md sections 1 and 2).
- [SETUP] Create a private GitHub or GitLab repo and push after every phase. That is your backup.
- [DECISION] Get the client's answers to docs/PRD.md section 5 (at least 1, 3, 5 and 11 to 18). Write them in docs/PROGRESS.md under Decisions.
- [SETUP] Read docs/DEV_ENVIRONMENT.md. Your laptop (RTX 4050, 6 GB) is the dev machine; the MacBook is for agent tests.
- [SETUP] Collect the CLIENT's GPU PC facts: GPU model and VRAM, operating system, RAM, free disk, internet provider and speed, whether it can stay on 24/7.
- [SETUP] Arrange test devices: a MacBook with a spare user account, a Windows laptop, and a second person for face tests.

## Phase 0 Bootstrap
- [SETUP] Start Docker Desktop before running commands.
- [SETUP] Copy .env.example to .env. Claude generates the secrets; never share .env anywhere.
- [TEST] Open the health page and confirm the database shows OK.

## Phase 1 Auth, invite codes
- [DECISION] Registration window, owner approval and extra profile fields (PRD questions 11 to 16).
- [SETUP] Put your real owner email and a strong password in .env (OWNER_EMAIL, OWNER_PASSWORD) before seeding.
- [TEST] Try a wrong code, an expired code (wait 10 minutes) and a revoked code, using the API tests or curl commands Claude gives you.

## Phase 2 Sessions and hours
- [DECISION] Are idle minutes deducted from working hours? Is there an expected daily-hours target? (PRD 1 and 9)
- [TEST] Start, stop, resume; leave a session open past midnight; check the totals look right.

## Phase 3 Web screens
- [TEST] Click through as owner (generate a code) and as a new employee in a private window (register).
- [LEGAL] Write the consent text (what is tracked, that no images are stored, who sees the data). Claude puts a placeholder; replace it before real use.
- [DECISION] Show the pages in docs/SCREENS.md to the client and note changes.
- [TEST] Open the owner pages on your phone (use the quick tunnel in docs/DEV_ENVIRONMENT.md) and check the layout at phone width.

## Phase 4 LLM
- [SETUP][BLOCKER] On your laptop: install Ollama from ollama.com. Claude gives the exact `ollama pull` commands. Start with a 4B-class model (qwen3.5:4b); a 6 GB GPU cannot hold 7 to 8B models comfortably.
- [TEST] Run `ollama ps` while a model answers; it must say 100% GPU. If not, close GPU-heavy apps or use a smaller model or context.
- [TEST] Run the eval script (scripts/llm-eval.ts; Claude gives the command) on 2 or 3 models and read every output. Ask a Hinglish speaker, ideally the owner, to judge quality. Record the results in docs/PROGRESS.md.
- [DECISION] Set a working OLLAMA_MODEL in .env. The FINAL model is chosen later on the client's GPU (it may be bigger); no code change is needed.

## Phase 5 Projects and tasks
- [TEST] Collect 3 to 5 REAL project descriptions from the owner and try them. Add any missing job roles in the UI.

## Phase 6 Updates
- [TEST] Write real technical updates and check the plain version makes sense to the owner.

## Phase 7 Realtime
- [TEST] On the owner's real computer and browser: click "Enable alerts", set the volume, trigger a simulated idle event, confirm the beep with the employee's name. Browsers block sound until the page has been clicked.
- [TEST] On your phone: confirm the beep works only while the page is open. (R) Enable push notifications and confirm an alert arrives with the page closed. On iPhone, Add to Home Screen first.

## Phase 8 Agent core
- [SETUP] Install the dev build on the MacBook and on the Windows laptop (your dev laptop if it runs Windows).
- [TEST] Approve OS prompts. Test sleep and wake, Wi-Fi off for 5 minutes, shutdown, restart (autostart) and logout.

## Phase 9 Face and idle
- [BLOCKER][SETUP] Allow camera permission for the agent on macOS and Windows.
- [TEST] The five acceptance cases: your face, another person, empty chair, covered lens, no input. Also glasses, a dark room, a bright window behind the person, a second monitor. Tune FACE_MATCH_THRESHOLD from the results.
- [DECISION] What counts as background work for editors and designers (renders, exports); the exact idle policy.
- [LEGAL] Get the final consent wording approved and plan to collect signed consent from every employee.

## Phase 10 Restricted mode
- [SETUP][BLOCKER] Use the spare MacBook, with a separate STANDARD (non-admin) macOS user for the test employee and an admin account for you. NEVER your daily account.
- [SETUP] Run the one-time admin setup script (needs the Mac admin password). Claude explains each command and asks first.
- [TEST] Verify app bundle IDs on a real Mac, for example `osascript -e 'id of app "Visual Studio Code"'`. Confirm Antigravity's exact app name and domains.
- [DECISION] Run learn mode for 2 to 3 days with the client, then finalise the allowlist.
- [TEST] Run scripts/mac-unblock.sh and confirm the Mac returns to normal.
- [PAID][DECISION] Tell the client that without an MDM service the blocking is best-effort. MDM is a paid subscription if they want it stronger.

## Phase 11 Packaging and deployment (prepare on your laptop)
- [SETUP] Claude builds the Mac and Windows installers, install scripts and the deploy/ folder.
- [TEST] Dry-run production deployment on your laptop (production compose file plus a Cloudflare quick tunnel). Log in from the MacBook and your phone over HTTPS.
- [TEST] On the MacBook run the install script, then `xattr -l /Applications/<App>.app`: there should be no com.apple.quarantine entry. Confirm the app opens without a Gatekeeper warning, the camera prompt appears and the agent starts at login. If it is blocked, use the fallbacks in ARCHITECTURE section 11.
- [TEST] On Windows run the installer or the PowerShell script; note the SmartScreen steps (More info, Run anyway) for the guide.
- [DECISION] No Apple Developer account is needed. Optionally create a free self-signed code-signing certificate in Keychain Access so camera permission survives agent updates.

## On-site at the client's PC (after Phase 11)
- [SETUP] Always-on: disable sleep, set "restore power after outage" in BIOS, UPS if possible, auto-start Docker, Ollama and cloudflared at boot.
- [SETUP] Install Docker, Ollama and cloudflared. Pull the model and run the LLM eval on THEIR GPU; pick the best model that fits (OLLAMA_MODEL in .env).
- [SETUP] Create the Cloudflare account, add the client's domain and create the tunnel (steps in docs/DEPLOYMENT.md), or choose Tailscale if the client wants a private VPN.
- [SETUP] Firewall: block ports 11434 (Ollama) and 5432 (PostgreSQL) from the network.
- [SETUP] Backups: external disk or cloud folder for nightly dumps; do one restore test.
- [SETUP] Start with an empty database, create the owner account, set fresh secrets.
- [SETUP] Company MacBooks: create a standard (non-admin) account for each employee and keep the admin account with the owner; install the agent with the install script; run the one-time admin setup for restricted mode.
- [TEST] Log in from an employee's home internet over the public URL.
- If you use Claude Code on their PC at all, run /logout afterwards.

## Phase 12 Hardening and handover
- [TEST] Run docs/QA_CHECKLIST.md on real devices.
- [TEST] Pilot with 2 or 3 employees for about a week; fix what they report.
- [LEGAL] Collect signed employee consent.
- [SETUP] Change the seeded owner password, rotate every secret in .env, confirm .env is not in git, restore-test a backup.
- Hand over: source code, credentials, docs/DEPLOYMENT.md, owner and employee guides, a walkthrough session. Then request the final 50% payment per the quotation.

## After delivery (tell the client)
- Keep the GPU PC updated and on UPS power; check backups monthly.
- After a macOS update, re-check the agent's permissions.
- Renew the domain and any certificates.
