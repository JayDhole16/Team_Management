// LLM evaluation: runs every sample in docs/llm-eval-samples.md against the real Ollama model and
// writes a markdown report for a human (ideally the owner) to judge. Entry: scripts/llm-eval.ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlainLanguage } from '@lk/shared';
import { loadLlmEnv } from '../config/env';
import { DEFAULT_JOB_ROLES } from '../lib/default-job-roles';
import { createOllamaClient } from './ollama-client';
import { runBreakdown, runTranslateTask, runTranslateUpdate, type PipelineDeps } from './pipelines';
import { LlmError } from './types';

export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export const SAMPLES_PATH = resolve(REPO_ROOT, 'docs/llm-eval-samples.md');

export type EvalPipeline = 'breakdown' | 'translate-task' | 'translate-update';

export interface EvalSample {
  id: string;
  pipeline: EvalPipeline;
  /** e.g. "vague" or "injection test" from `**B5 (vague)**`. */
  tag: string | null;
  input: string;
  expect: string;
  /** P2 only: the target role label, matched against the default job roles. */
  roleLabel: string | null;
}

const SECTION_PIPELINE: Record<string, EvalPipeline> = {
  P1: 'breakdown',
  P2: 'translate-task',
  P3: 'translate-update',
};

const ITEM_RE = /^\*\*([A-Z]\d+)(?: \(([^)]+)\))?\*\*\s*(?:\(to an? ([^)]+)\)\s*)?"(.+)"\s*$/;

/** Parses the samples file. Throws on an item it cannot read, so a doc edit cannot silently
 *  drop samples. */
export function parseSamples(markdown: string): EvalSample[] {
  const samples: EvalSample[] = [];
  let pipeline: EvalPipeline | null = null;
  const lines = markdown.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    const section = /^## (P\d)\b/.exec(line);
    if (section) {
      pipeline = SECTION_PIPELINE[section[1] ?? ''] ?? null;
      continue;
    }
    if (line.startsWith('## ')) {
      pipeline = null;
      continue;
    }
    if (!pipeline || !line.startsWith('**')) continue;

    const item = ITEM_RE.exec(line);
    if (!item) throw new Error(`Cannot parse eval sample line: ${line.slice(0, 60)}`);
    const [, id = '', tag, roleText, input = ''] = item;

    let expect = '';
    for (let j = i + 1; j < lines.length; j++) {
      const next = (lines[j] ?? '').trim();
      if (next.startsWith('Expect:')) {
        expect = next.slice('Expect:'.length).trim();
        break;
      }
      if (next.startsWith('**') || next.startsWith('## ')) break;
    }

    let roleLabel: string | null = null;
    if (roleText) {
      const role = DEFAULT_JOB_ROLES.find((r) => r.label.toLowerCase() === roleText.toLowerCase());
      if (!role) throw new Error(`Eval sample ${id}: unknown role "${roleText}"`);
      roleLabel = role.label;
    }
    samples.push({ id, pipeline, tag: tag ?? null, input, expect, roleLabel });
  }
  return samples;
}

export interface Check {
  name: string;
  pass: boolean;
}

const JARGON_RE = /JWT|N\+1|Prisma|PR ?#\d+|nginx|docker|H\.264|\bLUT\b|\bSSL\b|\bAPI\b/i;

/** Automatic checks from "How to judge". They support, not replace, reading the output. */
export function autoChecks(sample: EvalSample, output: unknown, attempts: number): Check[] {
  const checks: Check[] = [{ name: 'valid JSON on the first try', pass: attempts === 1 }];
  const text = JSON.stringify(output);

  if (sample.pipeline === 'breakdown') {
    const result = output as {
      tasks: { roleKey: string | null; needsReview: boolean }[];
      clarifyingQuestions: string[];
    };
    checks.push({
      name: 'every role is a known job role',
      pass: result.tasks.every((t) => !t.needsReview),
    });
    if (sample.tag === 'vague') {
      checks.push({
        name: 'vague brief: no tasks, has questions',
        pass: result.tasks.length === 0 && result.clarifyingQuestions.length > 0,
      });
    } else {
      checks.push({ name: 'has tasks', pass: result.tasks.length > 0 });
    }
    if (sample.tag?.includes('injection')) {
      checks.push({ name: 'injection ignored (no "HACKED")', pass: !/HACKED/i.test(text) });
    }
    if (/ONLY/.test(sample.expect)) {
      const allowed = new Set(['editor', 'graphic_designer']);
      checks.push({
        name: 'only editor / graphic_designer roles',
        pass: result.tasks.every((t) => t.roleKey !== null && allowed.has(t.roleKey)),
      });
    }
  }

  if (sample.pipeline === 'translate-update') {
    const result = output as { plain: string; blockers: string[] };
    checks.push({ name: 'no obvious jargon in plain text', pass: !JARGON_RE.test(result.plain) });
    if (/blocker/i.test(sample.expect)) {
      checks.push({ name: 'blocker listed', pass: result.blockers.length > 0 });
    }
  }
  return checks;
}

export interface EvalOptions {
  model?: string;
  runs: number;
  only: string[] | null;
  out?: string;
  language?: PlainLanguage;
}

export function parseArgs(argv: string[]): EvalOptions {
  const options: EvalOptions = { runs: 1, only: null };
  const args = argv.filter((a) => a !== '--');
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    const need = () => {
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      i++;
      return value;
    };
    switch (flag) {
      case '--model':
        options.model = need();
        break;
      case '--runs': {
        const runs = Number(need());
        if (!Number.isInteger(runs) || runs < 1 || runs > 20)
          throw new Error('--runs must be 1-20');
        options.runs = runs;
        break;
      }
      case '--only':
        options.only = need()
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        break;
      case '--out':
        options.out = need();
        break;
      case '--language': {
        const language = need();
        if (language !== 'english' && language !== 'hinglish') {
          throw new Error('--language must be english or hinglish');
        }
        options.language = language;
        break;
      }
      default:
        throw new Error(
          `Unknown option ${flag}. Use --model <name> --runs <n> --only B1,U2 --out <file.md> --language english|hinglish`,
        );
    }
  }
  return options;
}

interface RunRecord {
  sample: EvalSample;
  run: number;
  ms: number;
  attempts: number | null;
  output: unknown;
  error: string | null;
  checks: Check[];
}

async function runSample(deps: PipelineDeps, sample: EvalSample) {
  switch (sample.pipeline) {
    case 'breakdown':
      return runBreakdown(deps, {
        brief: sample.input,
        roles: DEFAULT_JOB_ROLES.map((r) => ({ id: null, ...r })),
      });
    case 'translate-task':
      return runTranslateTask(deps, { text: sample.input, roleLabel: sample.roleLabel });
    case 'translate-update':
      return runTranslateUpdate(deps, { text: sample.input });
  }
}

function slug(text: string) {
  return text.replace(/[^a-zA-Z0-9.-]+/g, '-');
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const env = loadLlmEnv();
  const model = options.model ?? env.OLLAMA_MODEL;
  const language = options.language ?? env.PLAIN_LANGUAGE;
  const client = createOllamaClient({ ...env, OLLAMA_MODEL: model });
  const deps: PipelineDeps = { client, timeoutMs: env.OLLAMA_TIMEOUT_MS, language };

  const health = await client.health();
  if (health.status !== 'ok') {
    const hint =
      health.status === 'down'
        ? `Ollama is not reachable at ${env.OLLAMA_BASE_URL}. Start Ollama and try again.`
        : `Model ${model} is not pulled. Run: ollama pull ${model}`;
    console.error(hint);
    process.exitCode = 1;
    return;
  }

  let samples = parseSamples(readFileSync(SAMPLES_PATH, 'utf8'));
  if (options.only) samples = samples.filter((s) => options.only?.includes(s.id));
  if (samples.length === 0) throw new Error('No samples selected');

  const records: RunRecord[] = [];
  let gpuPercent: number | null = null;
  for (const sample of samples) {
    for (let run = 1; run <= options.runs; run++) {
      const started = performance.now();
      process.stderr.write(`${sample.id} run ${run}/${options.runs} ... `);
      try {
        const result = await runSample(deps, sample);
        const { meta, ...output } = result;
        const record: RunRecord = {
          sample,
          run,
          ms: meta.durationMs,
          attempts: meta.attempts,
          output,
          error: null,
          checks: autoChecks(sample, output, meta.attempts),
        };
        records.push(record);
        const failed = record.checks.filter((c) => !c.pass).length;
        process.stderr.write(
          `ok ${(meta.durationMs / 1000).toFixed(1)} s, attempts ${meta.attempts}${failed ? `, ${failed} check(s) failed` : ''}\n`,
        );
      } catch (err) {
        const message = err instanceof LlmError ? `${err.kind}: ${err.message}` : String(err);
        records.push({
          sample,
          run,
          ms: Math.round(performance.now() - started),
          attempts: null,
          output: null,
          error: message,
          checks: [{ name: 'answer received', pass: false }],
        });
        process.stderr.write(`FAILED (${message})\n`);
      }
      // Measured while the model is still loaded.
      if (gpuPercent === null) gpuPercent = (await client.health()).gpuPercent;
    }
  }

  const total = records.length;
  const firstTry = records.filter((r) => r.attempts === 1).length;
  const retried = records.filter((r) => r.attempts === 2).length;
  const failed = records.filter((r) => r.error !== null).length;
  const allChecks = records.flatMap((r) => r.checks);
  const passedChecks = allChecks.filter((c) => c.pass).length;
  const okRuns = records.filter((r) => r.error === null);
  const avgMs = okRuns.length ? okRuns.reduce((sum, r) => sum + r.ms, 0) / okRuns.length : 0;
  const maxMs = okRuns.reduce((max, r) => Math.max(max, r.ms), 0);

  const lines: string[] = [
    `# LLM eval: ${model}`,
    '',
    `Date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · num_ctx ${env.OLLAMA_NUM_CTX} · plain language ${language} · runs per sample ${options.runs}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Valid JSON on the first try | ${firstTry}/${total} (target: at least 95%) |`,
    `| Needed the one retry | ${retried} |`,
    `| Failed (no usable answer) | ${failed} |`,
    `| Automatic checks passed | ${passedChecks}/${allChecks.length} |`,
    `| Latency avg / max | ${(avgMs / 1000).toFixed(1)} s / ${(maxMs / 1000).toFixed(1)} s |`,
    `| Model on GPU (ollama ps) | ${gpuPercent === null ? 'unknown' : `${gpuPercent}%`} |`,
    '',
    'Read every output below. The automatic checks only catch obvious problems; Hinglish quality and',
    'whether the tasks make sense must be judged by a person.',
    '',
  ];
  for (const r of records) {
    lines.push(
      `## ${r.sample.id}${r.sample.tag ? ` (${r.sample.tag})` : ''}, run ${r.run}: ${r.sample.pipeline}`,
      '',
      `**Input${r.sample.roleLabel ? ` (to ${r.sample.roleLabel})` : ''}:** ${r.sample.input}`,
      '',
      `**Expect:** ${r.sample.expect}`,
      '',
      `**Time:** ${(r.ms / 1000).toFixed(1)} s · **attempts:** ${r.attempts ?? '-'}`,
      '',
      ...r.checks.map((c) => `- ${c.pass ? 'PASS' : 'FAIL'} ${c.name}`),
      '',
    );
    if (r.error) lines.push(`**Error:** ${r.error}`, '');
    else lines.push('```json', JSON.stringify(r.output, null, 2), '```', '');
  }
  const report = lines.join('\n');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  // pnpm runs the script inside apps/server; INIT_CWD is where the command was typed.
  const outPath = resolve(
    process.env.INIT_CWD ?? process.cwd(),
    options.out ?? resolve(REPO_ROOT, 'llm-eval-results', `${slug(model)}-${stamp}.md`),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, report, 'utf8');

  console.log(lines.slice(0, 16).join('\n'));
  console.log(`\nFull report: ${outPath}`);
}
