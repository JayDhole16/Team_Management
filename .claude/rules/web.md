---
paths:
  - "apps/web/**"
---
# Web rules
- Server state through TanStack Query; no raw fetch calls inside components (use the api client).
- Routes are guarded by role. Owner pages must never flash for employees.
- Timers are derived from server timestamps (session.started_at), never from a local counter alone.
- Render LLM text as plain text. Never use dangerouslySetInnerHTML.
- Browsers block audio until a user gesture: the owner dashboard needs an "Enable alerts" button that unlocks sound.
- Registration wizard: one step per screen, keep the password and face data in memory only (never localStorage), and show the same generic message for any invalid code.
- Owner pages are mobile-first: test at 390 px width, touch targets at least 44 px, tables become cards on small screens.
- Keep UI simple and readable; the owner is non-technical. Use clear labels in plain English.
