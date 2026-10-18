# Employee onboarding flow — invite code, register, face scan

Requirements: PRD O-9, O-11, O-12, E-0, A-3. Design: ARCHITECTURE sections 4, 6, 8, 10. Built in Phases 1 (API), 3 (UI), 9 (face step).

## 1. The flow
```
OWNER (dashboard)                SERVER                        NEW EMPLOYEE (login page)
Add new employee
 - device mode (required)
 - job role, note (optional)
 -- POST /codes/invite ------->  create code, store hash,
 <-- code shown ONCE + 10:00     expires in 10 min
     countdown, Copy, Revoke
 share code (WhatsApp / in person) ---------------------------->  "Register as employee"
                                                                  Step 1  Enter code
                                 <-- POST /register/claim ------
                                 code ACTIVE and not expired?
                                 yes: status CLAIMED, return a
                                 registration token (30 min)
                                 no: generic error
                                                                  Step 2  Name, email, password,
                                                                          job role, phone (optional)
                                                                  Step 3  Consent (tracking + face)
                                                                  Step 4  Face scan (on this device)
                                 <-- POST /register/complete ---
                                 ONE transaction:
                                  validate token + fields
                                  duplicate-face check (R)
                                  create user (ACTIVE)
                                  save encrypted face template
                                  record consent
                                  code -> USED, audit log
 toast "Rahul registered"  <---  emit employee:registered
                                                                  Step 5  Success: download the desktop
                                                                          agent, then log in
```
Nothing is saved for the employee until Step 4 completes, so there are no half-created accounts. If the employee abandons the wizard, the code simply ends up CLAIMED-then-expired and the owner issues a new one.

## 2. Screens

### Owner
- **Employees page** has an "Add new employee" button.
- **Add new employee modal:** device mode (Company MacBook / Personal, required, no default), job role (optional, if chosen it is locked for the employee), note (optional). "Generate code".
- **Code panel:** big code grouped like `K7M4-Q9XB`, countdown from 10:00, Copy button, Revoke button. A warning says it is shown only once. After expiry or closing, the code cannot be shown again (only a hash is stored); the owner generates a new one.
- **Pending invites list:** note, device mode, status (Active, Claimed, Used, Expired, Revoked), time left, Revoke.
- **Toast** when someone registers; **security alert** on duplicate-face rejection or too many wrong codes.
- **Employee detail:** edit role, device mode, idle interval; (R) "Issue password-reset code", (R) "Issue face re-scan code"; Deactivate (signs out everywhere, deletes face template, keeps history).

### New employee (login page)
The login page has three links: **Login**, **Register as employee**, **Forgot password? (ask the owner for a reset code)**.

| Step | Screen | Rules |
|---|---|---|
| 1 | Enter code | Case-insensitive, dashes optional. Any failure shows: "This code is invalid or has expired. Ask the owner for a new one." |
| 2 | Details | Name 2-80 chars. Email valid and unique (case-insensitive). Password at least 10 characters, entered twice, not a common password. Job role from the list (locked if the owner preset it). Phone optional. There is NO editable device-mode field. A read-only line shows "Device type: Company MacBook (set by the owner)" or "Personal laptop", with a confirm tick ("This is the MacBook Leaders Key gave me" or "This is my own laptop"). The confirm is only a statement; the server uses the owner's value, and a mismatch (for example a Windows agent on a company-MacBook account) raises an alert to the owner. |
| 3 | Consent | Plain-language text: what is tracked (work hours, activity, camera checks), that images are never stored, who sees the data. Must be accepted. Version and time are recorded. |
| 4 | Face scan | Guided: look straight, slightly left, slightly right (about 5 frames). Quality checks: exactly one face, large enough, bright enough, sharp. Visible camera indicator. Frames are discarded immediately; only the averaged template is sent. Clear messages for permission denied or no camera. |
| 5 | Done | "You are registered." Shows download links for the desktop agent (matching the device mode the owner chose) and a Log in button. |

## 3. Code states
`ACTIVE` -> `CLAIMED` (employee entered it; registration window of 30 min starts) -> `USED` (registration completed).
`ACTIVE` -> `EXPIRED` (10 min passed) · `ACTIVE` -> `REVOKED` (owner cancelled) · `CLAIMED` -> `EXPIRED` (30 min passed without completing).
A code can be used exactly once. Purposes: `INVITE`, (R) `PASSWORD_RESET`, (R) `FACE_RESCAN` (these two are tied to one existing employee).

## 4. Security rules
1. Code: 8 characters from an unambiguous alphabet (no 0, O, 1, I, L), crypto-random, stored only as a keyed hash.
2. Claim endpoint: max 5 failures per IP per 15 minutes, plus a global failure cap. Hitting the cap raises a `security:alert` to the owner.
3. One generic error message for every failure (wrong, expired, revoked, used). No hints.
4. Registration token: random, hashed, bound to the code, 30 minutes, single use.
5. The server decides device mode and anything owner-only. The register payload is validated with a strict Zod schema that rejects unknown fields.
6. HTTPS only (also needed for browser camera access).
7. Audit log entries for: code created, revoked, claimed, used, registration completed, claim failures (aggregated), duplicate-face rejection.
8. Face data: no images, ever. Template encrypted at rest. Duplicate-face check (R) so one person cannot hold two accounts.

## 5. Password reset and face re-scan (R, no email server)
- **Forgot password:** employee tells the owner, owner issues a PASSWORD_RESET code for that employee, employee enters email + code + new password on the login page. Same 10-minute rules.
- **Face re-scan:** owner issues a FACE_RESCAN code; employee enters it in the web app or agent and repeats the face step. The old template is replaced.
- **Deactivate / reactivate:** deactivation blocks login, revokes tokens, deletes the face template. Reactivation requires a new FACE_RESCAN code.

## 6. Edge cases to handle
- Code entered twice in two tabs: the second gets the generic error.
- Employee claims the code, then closes the browser or loses the page: the code is already CLAIMED and cannot be claimed again, so the owner issues a new one. This is the simple, safe default; revisit only if it happens often.
- Email already registered: tell the employee this email is already registered and to contact the owner (this is the one place a specific message is acceptable because the employee is already authenticated by the code).
- Camera denied or missing: registration cannot complete while FACE_ENROLLMENT_REQUIRED=true; show how to enable the camera.
- Owner pre-set a job role: the role field is shown but locked.
- Device mode COMPANY_MACBOOK but the agent later reports Windows: raise a device-mismatch event to the owner.
- Network drop at the final step: `/register/complete` is idempotent per registration token (a retry after success returns success, not a duplicate user).
- Face library or model changes: `face_model_version` mismatch forces a re-scan code.
- Owner deactivates an employee mid-session: session closes, agent shows signed-out screen.

## 7. Tests to write
- Code lifecycle: valid, expired at exactly 10 min, revoked, reused, wrong code, wrong purpose.
- Rate limit: 6th failed claim from one IP is blocked; successful claim does not reset the counter for other IPs.
- Claim token: expires at 30 min, single use, cannot be used with a different code.
- Complete: atomic (force a failure after the user insert and assert nothing persists), duplicate email in different case, weak password, missing consent, unknown job role, extra field `deviceMode` rejected.
- Duplicate face: second registration with the same template is rejected and an alert is emitted.
- RBAC: employee token cannot call /codes/*; no token gets 401.
- Playwright: owner generates code -> employee registers -> owner sees toast -> employee logs in and the timer starts.
- Idempotency: retry of /register/complete returns the same result.
