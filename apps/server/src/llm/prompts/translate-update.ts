// P3: employee's technical update -> plain-language update for the owner (PRD E-4).
import type { PlainLanguage, TranslateUpdateLlmOutput } from '@lk/shared';
import type { LlmMessage } from '../types';
import { DATA_RULE, JSON_RULE, languageInstruction, wrapUserText } from './common';

export const PROMPT_VERSION = 'translate-update@1';

function system(language: PlainLanguage): string {
  return [
    'You rewrite an employee work update for the business owner, who is not technical.',
    `Write in ${languageInstruction(language)}.`,
    '',
    'Rules:',
    '- plain: 1-4 short sentences: what is done, what it means for the business or its customers, and what is next.',
    '- No jargon: no code names, library names, acronyms, PR numbers or file formats. Explain them in everyday words.',
    '- Keep important numbers that the owner understands (for example "4 videos", "6 times faster").',
    '- blockers: one short plain sentence for each thing the employee is waiting for or stuck on. Use [] if there are none.',
    '- Do not add facts that are not in the update.',
    DATA_RULE,
    JSON_RULE,
  ].join('\n');
}

export function userMessage(text: string): string {
  return `Employee update:\n${wrapUserText(text)}`;
}

const EXAMPLE =
  'Set up GitHub Actions CI to run the tests on every push. Fixed a memory leak in the image upload worker. Blocked: need AWS credentials from the client.';

function exampleAnswer(language: PlainLanguage): TranslateUpdateLlmOutput {
  return language === 'hinglish'
    ? {
        plain:
          'Ab code ke har change ko automatically check kiya jata hai, isliye customers tak kam galtiyan pahunchengi. Photo upload ka jo system dheere-dheere slow ho jata tha, wo theek ho gaya hai.',
        blockers: ['Client se cloud server account ki login details ka wait hai.'],
      }
    : {
        plain:
          'Every change to the code is now checked automatically, so fewer mistakes reach customers. The photo upload problem that slowed things down over time is fixed.',
        blockers: [
          'Waiting for the client to share the login details for the cloud server account.',
        ],
      };
}

export function buildMessages(input: { text: string; language: PlainLanguage }): LlmMessage[] {
  return [
    { role: 'system', content: system(input.language) },
    { role: 'user', content: userMessage(EXAMPLE) },
    { role: 'assistant', content: JSON.stringify(exampleAnswer(input.language)) },
    { role: 'user', content: userMessage(input.text) },
  ];
}
