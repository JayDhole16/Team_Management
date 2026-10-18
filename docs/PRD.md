# Product Requirements — Leaders Key Workforce System

Client: Leaders Key · Built by: Jayraj Dhole & Dhairya Dixit · Quotation ref: LK-QT-2026-001

## 1. Users and devices
| Role | Who | Notes |
|---|---|---|
| Owner | One admin (the client) | Full access |
| Employee | Editor, Graphic Designer, Developer (Frontend, Backend, AI, Full-stack, others) | Works from office or home |

- Job roles are DATA (table `job_roles`), not hard-coded. Seed: editor, graphic_designer, frontend_developer, backend_developer, ai_developer, fullstack_developer. Owner can add more later.
- Device mode per employee: `company_macbook` (restricted mode) or `personal` (open mode, macOS or Windows). **Only the owner sets or changes it, never the employee.** The registration screen shows it read-only and the employee confirms it.
- Items marked **(R)** are recommended additions beyond the original brief. Confirm them with the client before building; they may need a scope/price discussion.

## 2. Functional requirements

### Owner
- **O-1 AI project breakdown.** Owner writes a project description in non-technical Hinglish. The local LLM returns a technical summary and a task list. Each task has title, technical description, required job role and priority. Owner can edit, delete, add and regenerate tasks before assigning. If the brief is too vague, the LLM returns clarifying questions instead of inventing tasks. *Accept:* invalid LLM output never reaches the UI; a clear message is shown if Ollama is down.
- **O-2 Assign task.** For each generated task the owner searches employees with a role filter (pre-set to the task's role), picks one and sends the task together with the project summary. Employee is notified.
- **O-3 Direct task.** Owner selects an employee and writes a task in non-technical language. The system produces a technical version. Owner previews/edits, then sends.
- **O-4 Task tracking.** Owner sees every employee's tasks by status: pending, in progress, completed, blocked. Filter by employee and status.
- **O-5 Working hours.** Per employee: today's hours, selected month's total, per-day breakdown, list of sessions.
- **O-6 Live status.** Per employee: Working, Idle, On break, Offline; last seen; idle reason; plus a warning "Agent not running" when a session is open but no agent heartbeat arrives.
- **O-7 Idle settings.** Per-employee idle-check interval. Default 20 min; allowed range 5-120. Takes effect at the agent's next sync.
- **O-8 Alerts.** When an idle event fires, the owner dashboard plays a beep and shows the employee's name and the reason. Alerts stay in a list until acknowledged. On a phone the in-page beep only works while the page is open; see O-14 for push notifications.
- **O-9 Employee management.** Owner sees all employees and can edit job role, device mode and idle interval, deactivate (offboard) an employee, and manage the allowed apps/websites list for restricted devices. Employees are NOT created by the owner directly; they self-register with an invite code (O-11). Deactivation signs the employee out everywhere, deletes their face template and keeps their task and hours history.
- **O-11 Add new employee (invite code).** Owner clicks "Add new employee", chooses the device mode (required) and optionally pre-selects a job role and a note (e.g. "Rahul - frontend"). The system generates a code that expires in 10 minutes, shown once with a countdown, Copy and Revoke buttons. Owner shares it with the new employee. A "Pending invites" list shows status (active, claimed, used, expired, revoked). Owner gets a notification when the employee finishes registering. See docs/ONBOARDING_FLOW.md.
- **O-12 (R) Code-based recovery.** For an existing employee the owner can issue a password-reset code or a face re-scan code (same mechanism, same 10-minute expiry). No email server is needed.
- **O-13 Works on a phone.** The whole owner dashboard is usable in a phone browser (responsive, touch-friendly) over the same HTTPS address, from anywhere. Priority pages on small screens: Overview, Live status, Alerts, Updates, Tasks, Employees (including Add new employee).
- **O-14 (R) Phone push alerts.** The owner dashboard is an installable web app (PWA) with Web Push, so an idle or security alert reaches the phone even when the page is closed. Android: works in Chrome. iPhone: only after Add to Home Screen (iOS 16.4 or later).
- **O-10 Updates inbox.** Owner reads employee updates in plain language; original technical text is expandable.

### Employee
- **E-0 Register as employee.** The login page has a "Register as employee" section. Step 1: enter the owner's code. Only if it is valid: Step 2 name, email, password, job role (and optional phone). Step 3 consent. Step 4 face scan. Step 5 success and agent download. The account is created only when all steps are complete (no half-created accounts). Full spec: docs/ONBOARDING_FLOW.md. (R) The new face is checked against existing employees to block duplicate registrations.
- **E-1 Login starts the timer.** After login the working session starts automatically.
- **E-2 Break.** "Stop session" pauses the timer (break); "Resume" starts a new session. Only one open session per employee.
- **E-3 My tasks.** Pending / in-progress / completed lists. Employee can change status. Project summary is visible on each task.
- **E-4 Send update.** Employee writes a technical update (optionally linked to a task). The system generates a plain-language version, employee previews, then sends to the owner.
- **E-5 My hours.** Today and current month totals.

### Desktop agent (macOS + Windows)
- **A-1** Installable app, login, start at OS login, tray icon with timer.
- **A-2** Heartbeat every 30 s with state; queue locally when offline.
- **A-3 Face enrollment.** Done during registration (E-0) on the employee's own device (browser or agent) using one shared face module; stores an encrypted template on the server. A new scan later (changed look, new camera) only through an owner-issued re-scan code (O-12).
- **A-4 Idle check** every N minutes (employee-specific, default 20). Pass only if (recent input OR background work detected) AND a face is present AND it matches the enrolled employee. Otherwise raise an idle event with a reason: NO_ACTIVITY, NO_FACE, FACE_MISMATCH, CAMERA_UNAVAILABLE.
- **A-5 Beep.** On an idle event the employee's device beeps and shows a modal; interacting with it acknowledges. The owner's dashboard beeps with the employee's name.
- **A-6 Restricted mode** (company MacBooks only). Allow only listed apps and websites; everything else is blocked. Attempts to bypass are reported as tamper events. Active only when the server says the employee's device is a company MacBook (set by the owner) AND the agent runs on macOS.
- **A-7 Open mode** (personal laptops). Nothing is blocked. Time tracking and idle checks still apply.
- **A-8 Privacy.** Camera frames are processed on the employee's device and discarded. A visible indicator shows when the camera is active. Registration shows a consent screen explaining what is tracked and the acceptance is recorded (version + time).

### Local LLM
- **L-1** Ollama only, running on the office GPU PC. No external AI APIs.
- **L-2** Three pipelines: brief to tasks, owner plain text to technical task, employee technical update to plain update.
- **L-3** Health check and graceful degradation (manual task entry still works).

## 3. Non-functional
- Designed for up to ~50 employees on one office GPU PC.
- Times stored in UTC; displayed and aggregated in Asia/Kolkata.
- Passwords hashed (argon2id), server-side RBAC, HTTPS through a tunnel/VPN when accessed from home (also required for browser camera access).
- Access codes: 8 random characters, stored only as a hash, single-use, 10-minute expiry, rate-limited, revocable. Every failure shows the same generic message.
- Session auto-closes at the last heartbeat if the agent goes silent for more than 3 minutes.

## 4. Out of scope (per quotation)
Hardware, paid licences (MDM, VPN, hosting), mobile apps, screenshot/screen-recording monitoring, payroll/billing, any feature not listed above.

## 5. Open questions — confirm with the client before the related phase
1. **Are idle minutes deducted from working hours?** Default assumption: idle time is logged and shown separately as active vs idle, but the session is not auto-stopped or deducted. (Phase 2, 7)
2. How many employees now and in a year? (capacity)
3. GPU model and VRAM of the PC (decides the Ollama model size). (Phase 4)
4. Initial allowed apps and websites, including exact app names (e.g. Antigravity). (Phase 10)
5. Who administers the MacBooks; will there be an MDM? Without MDM, blocking is best-effort with tamper reporting. (Phase 10)
6. Wording of the employee consent for activity tracking and face verification. (Phase 8)
7. What counts as "background activity" for editors/designers (renders, exports)? (Phase 9)
8. Plain-language output: Hinglish (Roman script) or English? Default: Hinglish. (Phase 4)
9. Work days/hours and holidays: any expected-hours target to show? (Phase 2)
10. Domain name or tunnel choice (Tailscale / Cloudflare Tunnel) for remote access. (Phase 11)
11. Registration window: the code must be entered within 10 minutes; once accepted, how long does the employee get to finish (default 30 min)? (Phase 1)
12. Should the owner approve each new employee after registration, or is the owner-issued code enough? Default: no extra approval, owner is notified. (Phase 1)
13. Store one profile photo at enrollment so the owner can visually verify identity? Default: NO, no images are ever stored. (Phase 9)
14. Should the owner be able to pre-select and lock the job role in the invite, or can employees always choose? Default: employee chooses unless owner pre-selected. (Phase 3)
15. Extra profile fields wanted: phone, joining date, emergency contact? Default: optional phone only. (Phase 3)
16. Confirm the (R) items are in scope: password-reset/re-scan codes, duplicate-face check, audit log. (Phase 1, 9)
17. GPU PC: operating system (Windows or Linux), runs 24/7?, UPS?, who maintains it? (Phase 11)
18. Is the client OK with Cloudflare as the connection provider (traffic is decrypted at Cloudflare's edge), or do they need a private VPN such as Tailscale (paid per user for a business)? (Phase 11)
19. Does the owner want phone push alerts (O-14)? iPhone users must add the site to the Home Screen. (Phase 7)
20. Will company MacBook users run as standard (non-admin) macOS accounts, with the owner holding the admin account? Strongly recommended; developers who need admin rights weaken the blocking. (Phase 10)
21. Final LLM model: decided on the client's GPU, not the 6 GB dev laptop. (Phase 11)
