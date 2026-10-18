# Screens — every page of the website and the agent

Build the pages that exist in each phase; later phases fill in the rest. Status badges: Working (green), Idle (amber), On break (blue), Offline (grey), Agent not running (red outline, shown when a session is open but no agent heartbeat arrives).

## 0. Public pages (before login)
**Login page**, one page with three links: Login | Register as employee | Forgot password.
- Login: email, password. Owner and employee use the same form; the role decides where they land.
- Register as employee: the wizard in docs/ONBOARDING_FLOW.md.
- Forgot password: "Ask the owner for a reset code", then email + code + new password.

## 1. Owner dashboard (left menu) — lands on Overview
1. **Overview** — cards: employees Working / Idle / On break / Offline; team hours today; open idle alerts; tasks by status; unread updates. Below: recent alerts and recent updates. Quick buttons: Add new employee, New project.
2. **Live status** — one card per employee: name, role, status badge, running session timer, hours today, last seen, last idle reason. Top bar: "Enable alerts" (unlocks sound) and an alerts panel. Clicking a card opens the employee page.
3. **Projects** — list of projects. "New project": big text box for the Hinglish description, Generate. Result page: technical summary, clarifying questions (if vague), editable task table (title, description, role, priority). Each task has Assign: employee search with role filter (pre-set to the task's role), then Send with project summary. Project page: summary, tasks and their status.
4. **Tasks** — board with columns Pending, In progress, Blocked, Completed; filters by employee, role, project. Button "Direct task": pick employee, write in plain words, see the technical version, edit, send.
5. **Employees** — table: name, role, device mode, status, idle interval, hours today and this month. Buttons: Add new employee (code modal), Pending invites. **Employee page:** profile; hours (today, month, per-day chart, session list including breaks); tasks; updates; idle events with reasons; settings (job role, device mode, idle interval); actions (issue password-reset code, issue face re-scan code, deactivate); device info (OS, agent version, last seen, tamper events).
6. **Hours and reports** — month picker; per employee: days worked, total hours, average per day, idle minutes; click through to per-day detail. (R) CSV export.
7. **Updates** — inbox of employee updates in plain language, unread badge, original technical text expandable, mark as read.
8. **Alerts** — history of idle and security alerts (employee, reason, time, acknowledged), acknowledge button.
9. **Access rules** — for company MacBooks: allowed apps and websites (add, remove, enable), learn mode toggle, log of attempted blocked items, tamper events.
10. **Settings** — LLM health (Ollama online, model name, Test button), default idle interval, owner profile and password, agent download links.

### Owner on a phone
Same pages, same address, from anywhere. Below 768 px wide: bottom tab bar (Overview, Live, Alerts, Tasks, More), tables turn into cards, buttons at least 44 px tall, forms single column. Overview, Live status, Alerts and Updates are designed phone-first. "Add new employee" works on a phone (code shown large with Copy).
Alerts: "Enable alerts" turns on the in-page beep (works only while the page is open and the phone is unlocked). (R) "Enable notifications" subscribes the phone to push alerts. iPhone shows an "Add to Home Screen" hint first because push works only for the installed web app.

## 2. Employee dashboard (left menu) — lands on My Day
1. **My Day** — large session timer with Stop session (break) and Resume; today's hours; this month's hours; badges: "Agent running" or a warning "Desktop agent not running", and "Face enrolled". Shortcut to the next pending task.
2. **My tasks** — tabs Pending, In progress, Blocked, Completed. Task card: title, technical description, project summary, priority, date assigned. Actions: Start, Mark blocked (with reason), Complete.
3. **Send update** — technical text box, optional task link, Preview plain version, Send. List of past updates with Read/Unread.
4. **My hours** — today, month total, per-day list, session list with breaks.
5. **Profile** — name, role, change password, enter a face re-scan code, download the desktop agent, device info.
Toasts: new task assigned.

## 3. Desktop agent (no website; small native windows)
- **Tray icon and menu** — session timer, Stop session / Resume, Open dashboard, status line (Connected / Offline, restricted mode on/off), version.
- **First run** — consent screen, login, camera test (so the OS permission prompt appears while the employee is present), then the session starts.
- **Idle alert modal** — beeps, "Are you there?", dismiss to acknowledge.
- **Camera indicator** — visible whenever the camera is in use.
- **Block notice** (restricted mode) — "This app or site is not allowed by Leaders Key", with a warning period before an app is quit.
- **Signed-out screen** — shown if the owner deactivates the account.

## 4. States every page must handle
Loading, empty (with a helpful next step), error, and "LLM unavailable" (manual entry still works). All times shown in Asia/Kolkata.
