import { randomUUID } from 'node:crypto';
import {
  ApiErrorSchema,
  MarkAllReadResultSchema,
  MyUpdatePageSchema,
  MyUpdateSchema,
  TaskSchema,
  UnreadCountSchema,
  UpdatePageSchema,
  UpdatePreviewSchema,
  UpdateSchema,
  type UpdatePreview,
} from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { UPDATES_PER_USER } from '../services/context';
import { mockLlm } from '../test/mock-llm';
import { bearer, createHarness, EMPLOYEE_PASSWORD, type Harness } from '../test/helpers';

const TECH = 'Fixed the JWT refresh race; waiting for the staging DB credentials.';
const PLAIN = 'The login problem is fixed.';
const BLOCKER = 'Waiting for the test server password.';
const SECRET_TEXT = 'SECRET-UPDATE-TEXT-MARKER';

const p3 = (plain = PLAIN, blockers: string[] = [BLOCKER]) => JSON.stringify({ plain, blockers });

type Employee = { userId: string; accessToken: string };

describe('progress updates', () => {
  let h: Harness;
  let owner: string;
  let rahul: Employee;
  let priya: Employee;

  beforeEach(async () => {
    h = await createHarness({ captureLogs: true, llm: mockLlm() });
    rahul = await h.registerEmployee();
    priya = await h.registerEmployee({
      email: 'priya@example.com',
      body: { name: 'Priya Verma', jobRoleId: h.role('graphic_designer').id },
    });
    owner = await h.ownerToken();
  });

  const preview = async (token: string, textTechnical = TECH, answer = p3()) => {
    h.llm.answers.push(answer);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/updates/preview',
      headers: bearer(token),
      payload: { textTechnical },
    });
    expect(res.statusCode, res.body).toBe(200);
    return UpdatePreviewSchema.parse(res.json<{ data: unknown }>().data);
  };

  const signed = (p: UpdatePreview) => ({
    plain: p.plain,
    blockers: p.blockers,
    previewToken: p.previewToken,
  });

  const send = (token: string, payload: Record<string, unknown>) =>
    h.app.inject({ method: 'POST', url: '/api/v1/updates', headers: bearer(token), payload });

  const sendPlainless = async (token: string, textTechnical = TECH) => {
    const res = await send(token, { textTechnical });
    expect(res.statusCode, res.body).toBe(201);
    return MyUpdateSchema.parse(res.json<{ data: unknown }>().data);
  };

  const inbox = async (query = '') => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/updates${query}`,
      headers: bearer(owner),
    });
    expect(res.statusCode, res.body).toBe(200);
    return UpdatePageSchema.parse(res.json<{ data: unknown }>().data);
  };

  const mine = async (token: string, query = '') => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/updates/mine${query}`,
      headers: bearer(token),
    });
    expect(res.statusCode, res.body).toBe(200);
    return MyUpdatePageSchema.parse(res.json<{ data: unknown }>().data);
  };

  const unread = async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/updates/unread-count',
      headers: bearer(owner),
    });
    return UnreadCountSchema.parse(res.json<{ data: unknown }>().data).count;
  };

  const markRead = (id: string) =>
    h.app.inject({ method: 'PATCH', url: `/api/v1/updates/${id}/read`, headers: bearer(owner) });

  const directTask = async (assigneeId: string, title = 'Fix login') => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/direct',
      headers: bearer(owner),
      payload: {
        assigneeId,
        textOriginal: 'Login theek karo',
        title,
        descriptionTechnical: 'Fix the refresh token race.',
        priority: 'HIGH',
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return TaskSchema.parse(res.json<{ data: unknown }>().data);
  };

  const errorCode = (res: { json: () => unknown }) => ApiErrorSchema.parse(res.json()).error.code;

  it('preview → send: the owner gets exactly the previewed plain text and blockers', async () => {
    const task = await directTask(rahul.userId);
    const p = await preview(rahul.accessToken);
    expect(p).toMatchObject({ plain: PLAIN, blockers: [BLOCKER] });

    const res = await send(rahul.accessToken, {
      textTechnical: TECH,
      taskId: task.id,
      preview: signed(p),
    });
    expect(res.statusCode, res.body).toBe(201);
    const sent = MyUpdateSchema.parse(res.json<{ data: unknown }>().data);
    expect(sent).toMatchObject({
      textTechnical: TECH,
      textPlain: PLAIN,
      blockers: [BLOCKER],
      task: { id: task.id, title: 'Fix login' },
      readByOwnerAt: null,
    });
    expect(h.events.updates).toEqual([
      { updateId: sent.id, employeeId: rahul.userId, at: h.clock.now().toISOString() },
    ]);

    const page = await inbox();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: sent.id,
      employeeId: rahul.userId,
      employeeName: 'Rahul Sharma',
      textPlain: PLAIN,
      blockers: [BLOCKER],
      task: { id: task.id, title: 'Fix login', status: 'PENDING' },
    });
    expect(await unread()).toBe(1);
  });

  it('refuses a preview whose text, plain version, blockers or token were changed', async () => {
    const p = await preview(rahul.accessToken);
    const cases: Record<string, unknown>[] = [
      { textTechnical: `${TECH} more`, preview: signed(p) },
      { textTechnical: TECH, preview: { ...signed(p), plain: 'Everything is done!' } },
      { textTechnical: TECH, preview: { ...signed(p), blockers: [] } },
      { textTechnical: TECH, preview: { ...signed(p), previewToken: `${p.previewToken}0` } },
      { textTechnical: TECH, preview: { ...signed(p), previewToken: 'v1.1.abc' } },
    ];
    for (const payload of cases) {
      const res = await send(rahul.accessToken, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(errorCode(res)).toBe('PREVIEW_MISMATCH');
    }
    // Another employee cannot reuse Rahul's preview.
    const stolen = await send(priya.accessToken, { textTechnical: TECH, preview: signed(p) });
    expect(errorCode(stolen)).toBe('PREVIEW_MISMATCH');
    expect(await h.db.progressUpdate.count()).toBe(0);
  });

  it('sending the same preview twice saves it once', async () => {
    const p = await preview(rahul.accessToken);
    const body = { textTechnical: TECH, preview: signed(p) };
    const [first, second] = await Promise.all([
      send(rahul.accessToken, body),
      send(rahul.accessToken, body),
    ]);
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    const ids = [first, second].map(
      (r) => MyUpdateSchema.parse(r.json<{ data: unknown }>().data).id,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(await h.db.progressUpdate.count()).toBe(1);
    expect(h.events.updates).toHaveLength(1);
  });

  it('an AI answer that is empty once invisible characters are removed is a 502', async () => {
    h.llm.answers.push(p3('\u202E\u200B'));
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/updates/preview',
      headers: bearer(rahul.accessToken),
      payload: { textTechnical: TECH },
    });
    expect(res.statusCode).toBe(502);
    expect(errorCode(res)).toBe('LLM_BAD_OUTPUT');
  });

  it('a preview expires after an hour', async () => {
    const p = await preview(rahul.accessToken);
    h.clock.advanceMinutes(61);
    const token = await h.login('rahul@example.com', EMPLOYEE_PASSWORD); // access tokens last 15 min
    const res = await send(token, { textTechnical: TECH, preview: signed(p) });
    expect(errorCode(res)).toBe('PREVIEW_MISMATCH');
  });

  it('with the AI offline the preview fails cleanly and the update can be sent without it', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/updates/preview',
      headers: bearer(rahul.accessToken),
      payload: { textTechnical: TECH },
    });
    expect(res.statusCode).toBe(503);
    expect(errorCode(res)).toBe('LLM_UNAVAILABLE');

    const sent = await sendPlainless(rahul.accessToken);
    expect(sent).toMatchObject({ textPlain: null, blockers: [], textTechnical: TECH });
    expect((await inbox()).items[0]).toMatchObject({ textPlain: null, textTechnical: TECH });
  });

  it('drops invisible control and bidi characters from the AI answer', async () => {
    const p = await preview(rahul.accessToken, TECH, p3('Done\u202E now', ['\u2066Blocked']));
    expect(p).toMatchObject({ plain: 'Done now', blockers: ['Blocked'] });
    const res = await send(rahul.accessToken, { textTechnical: TECH, preview: signed(p) });
    expect(res.statusCode, res.body).toBe(201);
  });

  it('links only the employee’s own task; a moved task is no longer named to them', async () => {
    const own = await directTask(rahul.userId);
    const other = await directTask(priya.userId, 'Diwali post');

    for (const taskId of [other.id, randomUUID()]) {
      const res = await send(rahul.accessToken, { textTechnical: TECH, taskId });
      expect(res.statusCode).toBe(404);
    }

    const res = await send(rahul.accessToken, { textTechnical: TECH, taskId: own.id });
    expect(res.statusCode).toBe(201);

    // The owner moves the task to Priya.
    const moved = await h.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${own.id}/assign`,
      headers: bearer(owner),
      payload: { assigneeId: priya.userId },
    });
    expect(moved.statusCode).toBe(200);
    expect((await mine(rahul.accessToken)).items[0]?.task).toBeNull();
    expect((await inbox()).items[0]?.task).toMatchObject({ id: own.id, title: 'Fix login' });
  });

  it('an employee sees only their own updates', async () => {
    const rahulUpdate = await sendPlainless(rahul.accessToken, `Rahul: ${TECH}`);
    await sendPlainless(priya.accessToken, 'Priya: banner exported');

    const priyaPage = await mine(priya.accessToken);
    expect(priyaPage.items.map((u) => u.textTechnical)).toEqual(['Priya: banner exported']);
    expect(JSON.stringify(priyaPage)).not.toContain('Rahul');

    // Rahul's update id as a cursor does not reveal anything to Priya.
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/updates/mine?cursor=${rahulUpdate.id}`,
      headers: bearer(priya.accessToken),
    });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_CURSOR');

    // And the owner endpoints are closed to employees.
    for (const [method, url] of [
      ['GET', '/api/v1/updates'],
      ['PATCH', `/api/v1/updates/${rahulUpdate.id}/read`],
    ] as const) {
      const denied = await h.app.inject({ method, url, headers: bearer(priya.accessToken) });
      expect(denied.statusCode).toBe(403);
    }
  });

  it('the unread count follows mark-as-read and mark-all-read', async () => {
    const first = await sendPlainless(rahul.accessToken, 'First update text');
    h.clock.advanceMinutes(1);
    await sendPlainless(priya.accessToken, 'Second update text');
    expect(await unread()).toBe(2);

    const read = await markRead(first.id);
    expect(read.statusCode).toBe(200);
    const readAt = UpdateSchema.parse(read.json<{ data: unknown }>().data).readByOwnerAt;
    expect(readAt).toBe(h.clock.now().toISOString());
    expect(await unread()).toBe(1);

    // A second click keeps the first read time.
    h.clock.advanceMinutes(5);
    const again = UpdateSchema.parse((await markRead(first.id)).json<{ data: unknown }>().data);
    expect(again.readByOwnerAt).toBe(readAt);
    expect(await unread()).toBe(1);

    // The owner loaded the page now; an update arriving afterwards stays unread.
    const upTo = h.clock.now().toISOString();
    h.clock.advanceMinutes(1);
    const late = await sendPlainless(rahul.accessToken, 'Late update text');
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/updates/read-all',
      headers: bearer(owner),
      payload: { upTo },
    });
    expect(MarkAllReadResultSchema.parse(res.json<{ data: unknown }>().data).marked).toBe(1);
    expect(await unread()).toBe(1);
    expect((await inbox('?unread=true')).items.map((u) => u.id)).toEqual([late.id]);

    expect((await markRead(randomUUID())).statusCode).toBe(404);
  });

  it('the unread inbox keeps paging after its last row was marked read', async () => {
    await sendPlainless(rahul.accessToken, 'Older update text');
    h.clock.advanceMinutes(1);
    const newer = await sendPlainless(rahul.accessToken, 'Newer update text');
    const first = await inbox('?unread=true&limit=1');
    expect(first.items.map((u) => u.id)).toEqual([newer.id]);
    expect((await markRead(newer.id)).statusCode).toBe(200);
    const next = await inbox(`?unread=true&limit=1&cursor=${first.nextCursor ?? ''}`);
    expect(next.items.map((u) => u.textTechnical)).toEqual(['Older update text']);

    const unknown = await h.app.inject({
      method: 'GET',
      url: `/api/v1/updates?cursor=${randomUUID()}`,
      headers: bearer(owner),
    });
    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe('INVALID_CURSOR');
  });

  it('mark all read can be limited to one employee', async () => {
    await sendPlainless(rahul.accessToken, 'Rahul update text');
    await sendPlainless(priya.accessToken, 'Priya update text');
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/updates/read-all',
      headers: bearer(owner),
      payload: { upTo: h.clock.now().toISOString(), employeeId: priya.userId },
    });
    expect(MarkAllReadResultSchema.parse(res.json<{ data: unknown }>().data).marked).toBe(1);
    const left = await inbox('?unread=true');
    expect(left.items.map((u) => u.employeeId)).toEqual([rahul.userId]);
  });

  it('pages newest first without gaps or repeats, also for updates sent in the same instant', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await sendPlainless(rahul.accessToken, `Update number ${i}`)).id);
      if (i % 2 === 0) h.clock.advanceMinutes(1); // some updates share a timestamp
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await inbox(`?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...page.items.map((u) => u.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    expect(seen.sort()).toEqual([...ids].sort());

    const byEmployee = await inbox(`?employeeId=${priya.userId}`);
    expect(byEmployee.items).toEqual([]);
  });

  it(`limits an employee to ${UPDATES_PER_USER} updates per 15 minutes`, async () => {
    for (let i = 0; i < UPDATES_PER_USER; i++) {
      await sendPlainless(rahul.accessToken, `Update number ${i}`);
    }
    const res = await send(rahul.accessToken, { textTechnical: 'One too many' });
    expect(res.statusCode).toBe(429);
    // Others are not affected, and the window passes.
    await sendPlainless(priya.accessToken);
    h.clock.advanceMinutes(16);
    await sendPlainless(await h.login('rahul@example.com', EMPLOYEE_PASSWORD));
  });

  it('keeps a deactivated employee’s updates in the inbox', async () => {
    await sendPlainless(rahul.accessToken);
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${rahul.userId}/deactivate`,
      headers: bearer(owner),
    });
    expect(res.statusCode).toBe(200);
    expect((await inbox()).items).toHaveLength(1);
  });

  it('never logs the update text or the plain version', async () => {
    const tech = `${TECH} ${SECRET_TEXT}`;
    const p = await preview(rahul.accessToken, tech, p3(`Plain ${SECRET_TEXT}`, [SECRET_TEXT]));
    await send(rahul.accessToken, { textTechnical: tech, preview: signed(p) });
    await inbox();
    expect(h.logs.join('\n')).not.toContain(SECRET_TEXT);
  });
});
