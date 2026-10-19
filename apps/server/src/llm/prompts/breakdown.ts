// P1: owner's Hinglish project brief -> technical summary + task list (PRD O-1).
import type { BreakdownLlmOutput, PlainLanguage } from '@lk/shared';
import { DEFAULT_JOB_ROLES } from '../../lib/default-job-roles';
import type { LlmMessage } from '../types';
import { DATA_RULE, JSON_RULE, languageInstruction, wrapUserText } from './common';

export const PROMPT_VERSION = 'breakdown@1';

export interface RoleOption {
  key: string;
  label: string;
}

function system(language: PlainLanguage): string {
  return [
    'You are a technical project planner at a small digital agency (developers, graphic designers, video editors).',
    'The business owner describes a project in non-technical words, often in Hinglish (Hindi in Roman letters mixed with English).',
    'Turn the brief into a short technical summary and a list of tasks that the team can work on.',
    '',
    'Rules:',
    '- projectTitle: a short English name for the project.',
    '- technicalSummary: 2-5 sentences in English describing what will be built and the main parts.',
    '- tasks: one task per piece of work that one person can do. title is a short imperative in English;',
    '  description is 1-3 technical English sentences saying what to build and when it is done.',
    '- roleKey must be one of the job role keys given with the brief. Pick the role that does the work.',
    '- priority: HIGH for core features the project cannot launch without, MEDIUM for normal work, LOW for nice-to-have.',
    '- Only create tasks for work the brief asks for or clearly needs. Do not add design or video tasks unless',
    '  the brief asks for designs, banners, logos, videos or reels. Do not add developer tasks to a design-only or video-only brief.',
    '- If the brief names something concrete to build or make (for example "a landing page", "an app", "5 banners"),',
    '  create tasks for it with sensible defaults, and put the missing details in clarifyingQuestions.',
    '- Only if the brief does not say WHAT to build at all, do NOT invent a project: return "tasks": [] and 2-4 clarifyingQuestions.',
    '- If the brief is clear, clarifyingQuestions may be empty.',
    `- Write clarifyingQuestions in ${languageInstruction(language)}, because the owner reads them.`,
    DATA_RULE,
    JSON_RULE,
  ].join('\n');
}

export function userMessage(brief: string, roles: readonly RoleOption[]): string {
  const roleLines = roles.map((r) => `- ${r.key}: ${r.label}`).join('\n');
  return `Job roles (use only these keys):\n${roleLines}\n\nBrief:\n${wrapUserText(brief)}`;
}

// Few-shot examples. Deliberately different from docs/llm-eval-samples.md, so the eval does not
// grade answers the model has just been shown.
const EXAMPLE_CLEAR =
  'Hamare restaurant ke liye ek website chahiye jisme menu dikhe aur log online table book kar sake. Opening ke liye ek Instagram post ka design bhi chahiye.';

const EXAMPLE_CLEAR_ANSWER: BreakdownLlmOutput = {
  projectTitle: 'Restaurant website with table booking',
  technicalSummary:
    'A responsive restaurant website that shows the menu and lets customers book a table online. Bookings are saved in a database so staff can see them. One Instagram post design for the opening.',
  clarifyingQuestions: [],
  tasks: [
    {
      title: 'Build the menu and table booking pages',
      description:
        'Create responsive Home, Menu and Book a table pages. The booking form takes date, time, number of guests, name and phone, validates input and shows a confirmation.',
      roleKey: 'frontend_developer',
      priority: 'HIGH',
    },
    {
      title: 'Create the booking API and database',
      description:
        'Add REST endpoints to create and list bookings, store them in the database and reject a booking for a full time slot.',
      roleKey: 'backend_developer',
      priority: 'HIGH',
    },
    {
      title: 'Design the opening Instagram post',
      description:
        'Design one 1080x1080 Instagram post announcing the opening, using the restaurant logo and colours. Deliver PNG and the source file.',
      roleKey: 'graphic_designer',
      priority: 'MEDIUM',
    },
  ],
};

// Short but concrete: build it with sensible defaults and ask about the details.
const EXAMPLE_SHORT = 'Ek portfolio website bana do.';

function shortAnswer(language: PlainLanguage): BreakdownLlmOutput {
  return {
    projectTitle: 'Portfolio website',
    technicalSummary:
      'A responsive portfolio website with home, work samples, about and contact sections, deployed on a public URL.',
    clarifyingQuestions:
      language === 'hinglish'
        ? ['Portfolio kiska hai aur kaunse kaam dikhane hain?', 'Domain name pehle se hai?']
        : [
            'Whose portfolio is it, and which work should it show?',
            'Is there a domain name already?',
          ],
    tasks: [
      {
        title: 'Build the portfolio pages',
        description:
          'Create responsive Home, Work, About and Contact pages with a project gallery and a working contact form.',
        roleKey: 'frontend_developer',
        priority: 'HIGH',
      },
      {
        title: 'Deploy the website',
        description:
          'Deploy the site with HTTPS, connect the domain and check it on desktop and mobile.',
        roleKey: 'frontend_developer',
        priority: 'MEDIUM',
      },
    ],
  };
}

const EXAMPLE_VAGUE = 'Mere business ke liye kuch digital karna hai, jaldi.';

function vagueAnswer(language: PlainLanguage): BreakdownLlmOutput {
  const questions =
    language === 'hinglish'
      ? [
          'Aapka business kya karta hai aur aapke customers kaun hain?',
          'Aapko kya chahiye: website, mobile app, videos ya designs?',
          'Main goal kya hai: zyada sales, bookings ya brand awareness?',
        ]
      : [
          'What does your business do, and who are your customers?',
          'What do you need: a website, a mobile app, videos or designs?',
          'What is the main goal: more sales, more bookings or brand awareness?',
        ];
  return {
    projectTitle: 'Unclear digital project',
    technicalSummary: 'The brief does not say yet what should be built.',
    clarifyingQuestions: questions,
    tasks: [],
  };
}

export function buildMessages(input: {
  brief: string;
  roles: readonly RoleOption[];
  language: PlainLanguage;
}): LlmMessage[] {
  return [
    { role: 'system', content: system(input.language) },
    { role: 'user', content: userMessage(EXAMPLE_CLEAR, DEFAULT_JOB_ROLES) },
    { role: 'assistant', content: JSON.stringify(EXAMPLE_CLEAR_ANSWER) },
    { role: 'user', content: userMessage(EXAMPLE_SHORT, DEFAULT_JOB_ROLES) },
    { role: 'assistant', content: JSON.stringify(shortAnswer(input.language)) },
    { role: 'user', content: userMessage(EXAMPLE_VAGUE, DEFAULT_JOB_ROLES) },
    { role: 'assistant', content: JSON.stringify(vagueAnswer(input.language)) },
    { role: 'user', content: userMessage(input.brief, input.roles) },
  ];
}
