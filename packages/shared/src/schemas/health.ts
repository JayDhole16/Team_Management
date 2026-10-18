import { z } from 'zod';

export const HealthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
  time: z.iso.datetime(),
});
export type HealthData = z.infer<typeof HealthDataSchema>;
