---
paths:
  - "apps/agent/**"
---
# Desktop agent rules
- Electron security: contextIsolation true, nodeIntegration false, typed IPC through a preload script.
- All OS-specific calls (idle time, running apps, proxy settings, beep) sit behind an interface with macOS, Windows and fake implementations. Tests use the fake.
- Idle decision logic is a pure function with unit tests. Do not bury it inside timers or IPC handlers.
- Camera: capture a frame, compute the result, discard the frame. Never write frames to disk or send them anywhere.
- Enforcement features are behind a flag, support dry-run, and are active only when the server says device mode is company_macbook.
- The agent must survive server downtime: queue heartbeats and events locally and flush when back online.
