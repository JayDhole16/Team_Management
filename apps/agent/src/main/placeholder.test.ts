import { describe, expect, it } from 'vitest';
import { AGENT_PLACEHOLDER_MESSAGE } from './placeholder';

describe('agent placeholder', () => {
  it('points to the phase where the agent is built', () => {
    expect(AGENT_PLACEHOLDER_MESSAGE).toContain('Phase 8');
  });
});
