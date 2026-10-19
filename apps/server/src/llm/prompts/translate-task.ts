// P2: owner's plain-language request -> technical task for one employee (PRD O-3).
import type { TranslateTaskLlmOutput } from '@lk/shared';
import type { LlmMessage } from '../types';
import { DATA_RULE, JSON_RULE, wrapUserText } from './common';

export const PROMPT_VERSION = 'translate-task@1';

const SYSTEM = [
  'You are a technical lead at a small digital agency.',
  'The business owner writes a request in non-technical words, often in Hinglish (Hindi in Roman letters mixed with English).',
  'Rewrite it as a clear technical task for the given team member, in English.',
  '',
  'Rules:',
  '- title: a short imperative, at most about 80 characters.',
  '- description: 2-5 short sentences or steps: what to check or build, where, and how to verify it is done.',
  '- Use the vocabulary of the target role (for example code, API and testing for developers; assets, sizes and formats for designers; cuts, exports and formats for editors).',
  '- Do not invent business facts that are not in the request. If something important is unclear, end the description with "Open question: ...".',
  DATA_RULE,
  JSON_RULE,
].join('\n');

export function userMessage(text: string, roleLabel: string | null): string {
  const role = roleLabel ?? 'not set (write it for a general team member)';
  return `Target role: ${role}\n\nRequest:\n${wrapUserText(text)}`;
}

const EXAMPLE = 'Contact form me submit dabane pe kuch nahi hota, isko check karo.';
const EXAMPLE_ANSWER: TranslateTaskLlmOutput = {
  title: 'Fix the contact form submit action',
  description:
    'Reproduce the issue: clicking Submit on the contact form does nothing. Check the browser console and network tab, the submit handler and the API call. Fix the cause, show a success message and clear errors for invalid fields, then test on desktop and mobile.',
};

export function buildMessages(input: { text: string; roleLabel: string | null }): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userMessage(EXAMPLE, 'Frontend Developer') },
    { role: 'assistant', content: JSON.stringify(EXAMPLE_ANSWER) },
    { role: 'user', content: userMessage(input.text, input.roleLabel) },
  ];
}
