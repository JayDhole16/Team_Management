/** Seeded on every `pnpm db:seed` (PRD section 1). The owner can add more. No imports, so the
 *  LLM eval script can use it without loading Prisma. */
export const DEFAULT_JOB_ROLES: readonly { key: string; label: string }[] = [
  { key: 'editor', label: 'Editor' },
  { key: 'graphic_designer', label: 'Graphic Designer' },
  { key: 'frontend_developer', label: 'Frontend Developer' },
  { key: 'backend_developer', label: 'Backend Developer' },
  { key: 'ai_developer', label: 'AI Developer' },
  { key: 'fullstack_developer', label: 'Full-stack Developer' },
];
