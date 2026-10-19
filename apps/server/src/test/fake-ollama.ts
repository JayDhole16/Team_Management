// A tiny stand-in for Ollama, used only by the Playwright run (e2e-server.ts), so the browser
// tests need no GPU and get the same answer every time. It speaks the three endpoints the real
// client uses. `POST /__e2e/state {"down": true}` makes it drop every Ollama request, which the
// real client sees exactly like a stopped Ollama.
import { createServer, type IncomingMessage } from 'node:http';

export const FAKE_OLLAMA_MODEL = 'fake-model:latest';

/** A brief containing this word gets clarifying questions only (O-1 "too vague"). */
export const VAGUE_MARKER = 'VAGUE';

const BREAKDOWN = {
  projectTitle: 'Clothing store website',
  technicalSummary: 'An online clothing store with a product list, a cart and UPI payment.',
  clarifyingQuestions: [],
  tasks: [
    {
      title: 'Build the cart page',
      description: 'React cart page: list items, change quantity, show the total.',
      roleKey: 'frontend_developer',
      priority: 'HIGH',
    },
    {
      title: 'Design the homepage banner',
      description: 'A 1920x600 banner for the festive sale.',
      roleKey: 'graphic_designer',
      priority: 'MEDIUM',
    },
    {
      title: 'Edit the promo video',
      description: 'A 30-second promo from the shoot footage.',
      roleKey: 'video_wizard', // not a real role: the server must flag it for review
      priority: 'LOW',
    },
  ],
};

const VAGUE = {
  projectTitle: 'Website',
  technicalSummary: 'Not enough detail yet.',
  clarifyingQuestions: ['What should the website sell or show?', 'Who will use it?'],
  tasks: [],
};

const TRANSLATED = {
  title: 'Fix the login page error',
  description: 'Users see an error after entering a correct password. Reproduce, fix and test.',
};

const UPDATE = { plain: 'The work is going well.', blockers: [] };

/** An update that mentions "waiting" gets a blocker (e2e/updates.spec.ts). */
const UPDATE_WITH_BLOCKER = {
  plain: 'The login fix is done. Next is the cart page.',
  blockers: ['Waiting for the payment API key from the client.'],
};

const MAX_BODY_BYTES = 1_000_000;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
}

function answerFor(body: {
  format?: { properties?: Record<string, unknown> };
  messages?: { content: string }[];
}): unknown {
  const keys = Object.keys(body.format?.properties ?? {});
  const userText = body.messages?.at(-1)?.content ?? '';
  if (keys.includes('projectTitle')) {
    return userText.includes(VAGUE_MARKER) ? VAGUE : BREAKDOWN;
  }
  if (keys.includes('plain')) {
    return userText.toLowerCase().includes('waiting') ? UPDATE_WITH_BLOCKER : UPDATE;
  }
  return TRANSLATED;
}

export function startFakeOllama(port: number): Promise<void> {
  let down = false;
  const server = createServer((req, res) => {
    void (async () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url === '/__e2e/state' && req.method === 'POST') {
        const body = (await readJson(req)) as { down?: boolean };
        down = body.down === true;
        return send(200, { down });
      }
      if (down) {
        req.socket.destroy(); // like a closed port
        return;
      }
      if (req.url === '/api/tags') {
        return send(200, { models: [{ name: FAKE_OLLAMA_MODEL, model: FAKE_OLLAMA_MODEL }] });
      }
      if (req.url === '/api/ps') {
        return send(200, {
          models: [{ name: FAKE_OLLAMA_MODEL, model: FAKE_OLLAMA_MODEL, size: 1, size_vram: 1 }],
        });
      }
      if (req.url === '/api/chat' && req.method === 'POST') {
        const body = (await readJson(req)) as Parameters<typeof answerFor>[0];
        return send(200, {
          model: FAKE_OLLAMA_MODEL,
          message: { role: 'assistant', content: JSON.stringify(answerFor(body)) },
          done: true,
          done_reason: 'stop',
        });
      }
      send(404, { error: 'not found' });
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}
