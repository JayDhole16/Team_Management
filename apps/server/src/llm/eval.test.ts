import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autoChecks, parseArgs, parseSamples, SAMPLES_PATH, type EvalSample } from './eval';

describe('parseSamples (docs/llm-eval-samples.md)', () => {
  const samples = parseSamples(readFileSync(SAMPLES_PATH, 'utf8'));

  it('reads all 12 samples with their pipeline', () => {
    expect(samples.map((s) => `${s.id}:${s.pipeline}`)).toEqual([
      'B1:breakdown',
      'B2:breakdown',
      'B3:breakdown',
      'B4:breakdown',
      'B5:breakdown',
      'B6:breakdown',
      'T1:translate-task',
      'T2:translate-task',
      'T3:translate-task',
      'U1:translate-update',
      'U2:translate-update',
      'U3:translate-update',
    ]);
  });

  it('reads tags, inputs, expectations and P2 target roles', () => {
    const byId = Object.fromEntries(samples.map((s) => [s.id, s]));
    expect(byId.B5?.tag).toBe('vague');
    expect(byId.B6?.tag).toBe('injection test');
    expect(byId.B5?.input).toBe('Kuch accha sa banao jo business badha de.');
    expect(byId.B3?.expect).toMatch(/ONLY/);
    expect(byId.T1?.roleLabel).toBe('Frontend Developer');
    expect(byId.T2?.roleLabel).toBe('Graphic Designer');
    expect(byId.T3?.roleLabel).toBe('Backend Developer');
    expect(byId.U1?.roleLabel).toBeNull();
    expect(samples.every((s) => s.input.length > 10 && s.expect.length > 10)).toBe(true);
  });

  it('fails loudly on a line it cannot read', () => {
    expect(() => parseSamples('## P1 — x\n**B9** missing quotes\n')).toThrow(/Cannot parse/);
    expect(() => parseSamples('## P2 — x\n**T9** (to a pilot) "Fly"\nExpect: y\n')).toThrow(
      /unknown role/,
    );
  });
});

describe('autoChecks', () => {
  const sample = (over: Partial<EvalSample>): EvalSample => ({
    id: 'B1',
    pipeline: 'breakdown',
    tag: null,
    input: 'x',
    expect: 'y',
    roleLabel: null,
    ...over,
  });
  const failed = (checks: { name: string; pass: boolean }[]) =>
    checks.filter((c) => !c.pass).map((c) => c.name);

  it('flags injection output, wrong roles for a design-only brief, and retries', () => {
    const output = {
      tasks: [{ roleKey: 'backend_developer', needsReview: false, title: 'HACKED' }],
      clarifyingQuestions: [],
    };
    expect(
      failed(autoChecks(sample({ tag: 'injection test', expect: 'editor ONLY' }), output, 2)),
    ).toEqual([
      'valid JSON on the first try',
      'injection ignored (no "HACKED")',
      'only editor / graphic_designer roles',
    ]);
  });

  it('expects questions and no tasks for a vague brief', () => {
    const output = { tasks: [], clarifyingQuestions: ['What?'] };
    expect(failed(autoChecks(sample({ tag: 'vague' }), output, 1))).toEqual([]);
  });

  it('checks jargon and blockers on updates', () => {
    const s = sample({ id: 'U2', pipeline: 'translate-update', expect: 'one blocker' });
    expect(failed(autoChecks(s, { plain: 'Dockerized with nginx', blockers: [] }, 1))).toEqual([
      'no obvious jargon in plain text',
      'blocker listed',
    ]);
  });
});

describe('parseArgs', () => {
  it('reads the flags and ignores pnpm "--" separators', () => {
    expect(
      parseArgs([
        '--',
        '--model',
        'qwen3:8b',
        '--runs',
        '3',
        '--only',
        'b1, u2',
        '--language',
        'hinglish',
      ]),
    ).toEqual({ model: 'qwen3:8b', runs: 3, only: ['B1', 'U2'], language: 'hinglish' });
  });

  it('rejects bad values and unknown flags', () => {
    expect(() => parseArgs(['--runs', '0'])).toThrow(/1-20/);
    expect(() => parseArgs(['--model'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--fast'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--language', 'french'])).toThrow(/english or hinglish/);
  });
});
