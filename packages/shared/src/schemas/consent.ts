import { z } from 'zod';

/** Bump the version whenever the text changes; employees accept a specific version. */
export const CONSENT_VERSION = '2026-10-v2';

// Draft wording. Replace with the client's approved text (PRD open question 6).
export const CONSENT_TEXT = [
  'Leaders Key uses this system to track working time and activity on the device you use for work.',
  'What is recorded: when you start and stop work, whether you are active or idle, your tasks and the updates you send.',
  'Camera checks: at your set interval the desktop agent briefly opens the camera to check that you are at your desk. An on-screen indicator shows whenever the camera is on.',
  'Your face is turned into a set of numbers on your own device; only that encrypted template and the check results (present, match) are sent to the server.',
  'Profile photo: one photo is taken when you register (or re-scan your face) so the owner can confirm who you are. You see it before it is saved. It is stored encrypted, only the owner can see it, and it is deleted when you leave. No other images or video are ever stored or uploaded.',
  'On a company MacBook, only approved apps and websites can be used. Your personal laptop is never restricted.',
  'Who sees this data: only the owner of Leaders Key.',
].join('\n\n');

export const ConsentResponseSchema = z.object({
  version: z.string(),
  text: z.string(),
});
export type ConsentResponse = z.infer<typeof ConsentResponseSchema>;
