import { z } from 'zod';
import type { JsonSchema } from './types';

/** Keys removed before the schema goes to Ollama. Large length limits make the sampling
 *  grammar huge and slow; the strict Zod schema still checks them on the answer. */
const STRIPPED_KEYS = new Set(['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems']);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !STRIPPED_KEYS.has(key))
        .map(([key, inner]) => [key, strip(inner)]),
    );
  }
  return value;
}

/** Zod schema -> the JSON schema Ollama uses as `format`. */
export function toOllamaFormat(schema: z.ZodType): JsonSchema {
  return strip(z.toJSONSchema(schema)) as JsonSchema;
}
