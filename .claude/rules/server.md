---
paths:
  - "apps/server/**"
---
# Server rules
- Business logic lives in services. Routes only parse input (Zod), call a service, and shape the response.
- Hours are calculated in ONE place (services/hours.ts). Never re-implement it elsewhere.
- Use DB transactions when a request writes more than one table.
- Every route declares its allowed roles. Owner-only routes need a test proving an employee gets 403.
- Never log passwords, tokens, face templates, or raw LLM prompts that contain employee text at info level.
- Rate-limit login, /register/claim and all /ai/* routes.
- Access codes: generate with crypto.randomBytes, store only a keyed hash, never log or return them after creation, and return one generic error for every claim failure (do not reveal whether a code exists, expired or was used).
