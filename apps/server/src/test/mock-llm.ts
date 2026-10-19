import type { AiHealth } from '@lk/shared';
import { LlmError, type LlmChatRequest, type LlmClient } from '../llm/types';

/** A model answer that hit the token cap. */
export const TRUNCATED = { truncated: '{"projectTitle": "Sto' } as const;

/** Mock LLM: answers from a queue (a string is the model's text, an LlmError is thrown,
 *  TRUNCATED is a cut-off answer) and records every request. With an empty queue it behaves
 *  like a stopped Ollama. */
export function mockLlm(answers: (string | LlmError | typeof TRUNCATED)[] = []) {
  const requests: LlmChatRequest[] = [];
  let healthStatus: AiHealth['status'] = 'down';
  const client: LlmClient = {
    model: 'mock-model',
    async chat(request) {
      requests.push(request);
      const next = answers.shift();
      if (next === undefined) throw new LlmError('unavailable', 'Ollama cannot be reached.');
      if (next instanceof LlmError) throw next;
      if (typeof next !== 'string') {
        return { content: next.truncated, model: 'mock-model', truncated: true };
      }
      return { content: next, model: 'mock-model', truncated: false };
    },
    async health(): Promise<AiHealth> {
      return {
        status: healthStatus,
        model: 'mock-model',
        gpuPercent: healthStatus === 'ok' ? 100 : null,
        checkedAt: new Date().toISOString(),
      };
    },
  };
  return {
    client,
    requests,
    answers,
    setHealth(status: AiHealth['status']) {
      healthStatus = status;
    },
  };
}
