import { DEFAULT_ACTION_LIBRARY, normalizeActionLibrary, normalizeWeeklyPlan, WEEKDAY_KEYS } from '../shared/training';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEV_BYPASS_AUTH?: string;
  LOCAL_DEV_TOKEN?: string;
}

type Row = Record<string, unknown>;
type AppError = Error & { status?: number };

const json = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'cache-control': 'no-store' }
});

function fail(message: string, status = 400): never {
  const error: AppError = new Error(message);
  error.status = status;
  throw error;
}

function now() { return new Date().toISOString(); }
function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function nullableNumber(value: unknown) {
  return value !== undefined && value !== null && value !== '' ? Number(value) : null;
}
function stringValue(value: unknown) { return String(value ?? '').trim(); }
function uid() { return crypto.randomUUID(); }

function dateInShanghai(date = new Date()) {
  const pieces = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (type: string) => pieces.find((piece) => piece.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function weekdayKeyForDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  return WEEKDAY_KEYS[(date.getUTCDay() + 6) % 7];
}

function datesBetween(from: string, to: string) {
  const values: string[] = [];
  let cursor = new Date(`${from}T12:00:00+08:00`);
  const end = new Date(`${to}T12:00:00+08:00`);
  if (Number.isNaN(cursor.valueOf()) || Number.isNaN(end.valueOf()) || cursor > end) return values;
  while (cursor <= end) {
    values.push(dateInShanghai(cursor));
    cursor = new Date(cursor.valueOf() + 86_400_000);
  }
  return values;
}

function normalizeExercises(input: unknown) {
  const exercises = Array.isArray(input) ? input : [];
  return exercises.map((raw) => {
    const exercise = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const isCardio = exercise.type === 'cardio';
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    return {
      id: stringValue(exercise.id) || `a${crypto.randomUUID().slice(0, 12)}`,
      name: String(exercise.name || ''),
      part: String(exercise.part || ''),
      type: isCardio ? 'cardio' : 'resistance',
      done: Boolean(exercise.done),
      notes: String(exercise.notes || ''),
      first_set_ts: nullableNumber(exercise.first_set_ts),
      finish_ts: nullableNumber(exercise.finish_ts),
      duration: nullableNumber(exercise.duration),
      plan_sets: nullableNumber(exercise.plan_sets),
      deleted: Boolean(exercise.deleted),
      sets: sets.map((rawSet) => {
        const set = rawSet && typeof rawSet === 'object' ? rawSet as Record<string, unknown> : {};
        const isBodyweight = Boolean(set.is_bodyweight);
        return {
          weight_kg: isBodyweight ? null : nullableNumber(set.weight_kg),
          is_bodyweight: isBodyweight,
          reps: nullableNumber(set.reps),
          done: Boolean(set.done)
        };
      })
    };
  });
}

function mapTemplate(row: Row | null) {
  if (!row) return null;
  const base: Record<string, unknown> = { id: row.id, type: row.type, name: row.name };
  if (row.type === 'cardio') {
    base.action = row.cardio_action;
    base.speed = row.cardio_speed;
    base.duration = row.cardio_duration;
  } else {
    base.parts = safeJson(row.resistance_parts, []);
    base.exercises = safeJson(row.resistance_exercises, []);
  }
  return base;
}

function mapRecord(row: Row | null) {
  if (!row) return null;
  if (Number(row.session)) {
    return {
      id: row.id, date: row.date, session: true, templateId: null,
      mood: row.mood == null ? null : Number(row.mood), completed: Boolean(row.completed),
      syncCalendar: Boolean(row.sync_calendar), calendar: safeJson(row.calendar_json, null),
      actions: safeJson(row.resistance_exercises, []), createdAt: Date.parse(String(row.created_at))
    };
  }
  const base: Record<string, unknown> = {
    id: row.id, date: row.date, type: row.type, templateId: row.template_id,
    templateName: row.template_name, durationMinutes: row.duration_minutes,
    syncCalendar: Boolean(row.sync_calendar), completed: Boolean(row.completed),
    createdAt: Date.parse(String(row.created_at))
  };
  if (row.type === 'cardio') {
    base.cardio = { action: row.cardio_action, speed: row.cardio_speed, duration: row.cardio_duration };
  } else {
    base.resistance = { exercises: safeJson(row.resistance_exercises, []) };
  }
  return base;
}

async function body(request: Request) {
  try { return await request.json() as Record<string, unknown>; } catch { return fail('Invalid JSON'); }
}

async function requireUser(request: Request, env: Env) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (env.DEV_BYPASS_AUTH === 'true' && supplied && supplied === env.LOCAL_DEV_TOKEN) {
    const stamp = now();
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind('local-dev-user', 'local@trainlog.life', 'Local Developer', stamp, stamp).run();
    return 'local-dev-user';
  }
  return fail('登录功能尚未配置；本地开发请设置 .dev.vars', 401);
}

async function ensureLibrary(db: D1Database, userId: string) {
  const row = await db.prepare('SELECT library_json FROM action_library WHERE user_id = ?').bind(userId).first<Row>();
  if (row) return safeJson(row.library_json, DEFAULT_ACTION_LIBRARY);
  const parts = DEFAULT_ACTION_LIBRARY;
  await db.prepare('INSERT INTO action_library (user_id, library_json, updated_at) VALUES (?, ?, ?)')
    .bind(userId, JSON.stringify(parts), now()).run();
  return parts;
}

async function templateById(db: D1Database, userId: string, id: string) {
  return db.prepare('SELECT * FROM templates WHERE user_id = ? AND id = ?').bind(userId, id).first<Row>();
}

async function recordById(db: D1Database, userId: string, id: string) {
  return db.prepare('SELECT * FROM records WHERE user_id = ? AND id = ?').bind(userId, id).first<Row>();
}

function templateFields(input: Record<string, unknown>, previous?: Row | null) {
  const type = input.type || previous?.type;
  if (type !== 'cardio' && type !== 'resistance') fail('type must be cardio or resistance');
  const name = stringValue(input.name ?? previous?.name);
  if (!name) fail('name is required');
  if (type === 'cardio') {
    return [type, name, input.action ?? previous?.cardio_action ?? null, nullableNumber(input.speed ?? previous?.cardio_speed), nullableNumber(input.duration ?? previous?.cardio_duration), null, null] as const;
  }
  const parts = Array.isArray(input.parts) ? input.parts : safeJson(previous?.resistance_parts, []);
  const exercises = Array.isArray(input.exercises) ? normalizeExercises(input.exercises) : safeJson(previous?.resistance_exercises, []);
  return [type, name, null, null, null, JSON.stringify(parts), JSON.stringify(exercises)] as const;
}

function recordFields(input: Record<string, unknown>, previous?: Row | null) {
  const type = input.type || previous?.type;
  if (type !== 'cardio' && type !== 'resistance') fail('type must be cardio or resistance');
  const date = stringValue(input.date ?? previous?.date);
  const templateName = stringValue(input.templateName ?? previous?.template_name);
  if (!date || !templateName) fail(!date ? 'date is required' : 'templateName is required');
  const session = Boolean(input.session ?? Number(previous?.session));
  const cardio = input.cardio && typeof input.cardio === 'object' ? input.cardio as Record<string, unknown> : {};
  const resistance = input.resistance && typeof input.resistance === 'object' ? input.resistance as Record<string, unknown> : {};
  const previousExercises = safeJson(previous?.resistance_exercises, []);
  const exercises = session
    ? (Array.isArray(input.actions) ? normalizeExercises(input.actions) : previousExercises)
    : type === 'resistance'
      ? (Array.isArray(resistance.exercises) ? normalizeExercises(resistance.exercises) : previousExercises)
      : null;
  return {
    date, type, templateId: session ? null : (input.templateId ?? previous?.template_id ?? null), templateName,
    cardioAction: type === 'cardio' ? (cardio.action ?? previous?.cardio_action ?? null) : null,
    cardioSpeed: type === 'cardio' ? nullableNumber(cardio.speed ?? previous?.cardio_speed) : null,
    cardioDuration: type === 'cardio' ? nullableNumber(cardio.duration ?? previous?.cardio_duration) : null,
    exercises: exercises == null ? null : JSON.stringify(exercises),
    duration: nullableNumber(input.durationMinutes ?? previous?.duration_minutes) ?? 60,
    syncCalendar: input.syncCalendar === undefined ? Number(previous?.sync_calendar ?? 0) : (input.syncCalendar ? 1 : 0),
    completed: input.completed === undefined ? Number(previous?.completed ?? 0) : (input.completed ? 1 : 0),
    mood: nullableNumber(input.mood ?? previous?.mood), session: session ? 1 : 0,
    calendar: input.calendar === undefined ? previous?.calendar_json ?? null : JSON.stringify(input.calendar)
  };
}

async function planForDate(db: D1Database, userId: string, date: string) {
  const row = await db.prepare(`SELECT plan_json FROM weekly_plan_versions
    WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`).bind(userId, date).first<Row>();
  return row ? safeJson(row.plan_json, normalizeWeeklyPlan({})) : normalizeWeeklyPlan({});
}

async function listTemplates(db: D1Database, userId: string) {
  const result = await db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all<Row>();
  return result.results.map(mapTemplate);
}

async function listRecords(db: D1Database, userId: string, query: URLSearchParams) {
  const date = query.get('date'); const from = query.get('from'); const to = query.get('to');
  let statement: D1PreparedStatement;
  if (date) statement = db.prepare('SELECT * FROM records WHERE user_id = ? AND date = ? ORDER BY created_at ASC').bind(userId, date);
  else if (from && to) statement = db.prepare('SELECT * FROM records WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY created_at ASC').bind(userId, from, to);
  else statement = db.prepare('SELECT * FROM records WHERE user_id = ? ORDER BY created_at ASC').bind(userId);
  return (await statement.all<Row>()).results.map(mapRecord);
}

async function api(request: Request, env: Env, url: URL) {
  const userId = await requireUser(request, env);
  const { DB: db } = env;
  const pathname = url.pathname;

  if (pathname === '/api/templates' && request.method === 'GET') return json({ ok: true, templates: await listTemplates(db, userId) });
  if (pathname === '/api/templates' && request.method === 'POST') {
    const input = await body(request); const id = stringValue(input.id) || uid(); const fields = templateFields(input); const stamp = now();
    await db.prepare(`INSERT INTO templates (id,user_id,type,name,cardio_action,cardio_speed,cardio_duration,resistance_parts,resistance_exercises,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id, userId, ...fields, stamp, stamp).run();
    return json({ ok: true, template: mapTemplate(await templateById(db, userId, id)) }, 201);
  }
  const templateMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
  if (templateMatch) {
    const id = decodeURIComponent(templateMatch[1]); const previous = await templateById(db, userId, id);
    if (!previous) return json({ ok: false, error: 'template not found' }, 404);
    if (request.method === 'GET') return json({ ok: true, template: mapTemplate(previous) });
    if (request.method === 'PUT') {
      const fields = templateFields(await body(request), previous);
      await db.prepare(`UPDATE templates SET type=?,name=?,cardio_action=?,cardio_speed=?,cardio_duration=?,resistance_parts=?,resistance_exercises=?,updated_at=?
        WHERE user_id=? AND id=?`).bind(...fields, now(), userId, id).run();
      return json({ ok: true, template: mapTemplate(await templateById(db, userId, id)) });
    }
    if (request.method === 'DELETE') { await db.prepare('DELETE FROM templates WHERE user_id = ? AND id = ?').bind(userId, id).run(); return json({ ok: true }); }
  }

  if (pathname === '/api/records' && request.method === 'GET') return json({ ok: true, records: await listRecords(db, userId, url.searchParams) });
  if (pathname === '/api/records' && request.method === 'POST') {
    const input = await body(request); const id = stringValue(input.id) || uid(); const fields = recordFields(input); const stamp = now();
    await db.prepare(`INSERT INTO records (id,user_id,date,type,template_id,template_name,cardio_action,cardio_speed,cardio_duration,resistance_exercises,duration_minutes,sync_calendar,completed,mood,session,calendar_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, userId, fields.date, fields.type, fields.templateId, fields.templateName, fields.cardioAction, fields.cardioSpeed, fields.cardioDuration, fields.exercises, fields.duration, fields.syncCalendar, fields.completed, fields.mood, fields.session, fields.calendar, stamp, stamp).run();
    return json({ ok: true, record: mapRecord(await recordById(db, userId, id)) }, 201);
  }
  const recordMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch) {
    const id = decodeURIComponent(recordMatch[1]); const previous = await recordById(db, userId, id);
    if (!previous) return json({ ok: false, error: 'record not found' }, 404);
    if (request.method === 'GET') return json({ ok: true, record: mapRecord(previous) });
    if (request.method === 'PUT' || request.method === 'PATCH') {
      const fields = recordFields(await body(request), previous);
      await db.prepare(`UPDATE records SET date=?,type=?,template_id=?,template_name=?,cardio_action=?,cardio_speed=?,cardio_duration=?,resistance_exercises=?,duration_minutes=?,sync_calendar=?,completed=?,mood=?,session=?,calendar_json=?,updated_at=? WHERE user_id=? AND id=?`)
        .bind(fields.date, fields.type, fields.templateId, fields.templateName, fields.cardioAction, fields.cardioSpeed, fields.cardioDuration, fields.exercises, fields.duration, fields.syncCalendar, fields.completed, fields.mood, fields.session, fields.calendar, now(), userId, id).run();
      return json({ ok: true, record: mapRecord(await recordById(db, userId, id)) });
    }
    if (request.method === 'DELETE') { await db.prepare('DELETE FROM records WHERE user_id = ? AND id = ?').bind(userId, id).run(); return json({ ok: true }); }
  }

  if (pathname === '/api/weekly-plan/versions' && request.method === 'GET') {
    const rows = await db.prepare('SELECT effective_from, plan_json FROM weekly_plan_versions WHERE user_id = ? ORDER BY effective_from ASC').bind(userId).all<Row>();
    return json({ ok: true, versions: rows.results.map((row) => ({ effectiveFrom: row.effective_from, plan: safeJson(row.plan_json, normalizeWeeklyPlan({})) })) });
  }
  if (pathname === '/api/weekly-plan' && request.method === 'PUT') {
    const input = await body(request); const plan = normalizeWeeklyPlan(input.plan ?? input); const effectiveFrom = dateInShanghai();
    await db.prepare(`INSERT INTO weekly_plan_versions (user_id,effective_from,plan_json,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id,effective_from) DO UPDATE SET plan_json=excluded.plan_json,updated_at=excluded.updated_at`).bind(userId, effectiveFrom, JSON.stringify(plan), now()).run();
    const rows = await db.prepare('SELECT effective_from, plan_json FROM weekly_plan_versions WHERE user_id = ? ORDER BY effective_from ASC').bind(userId).all<Row>();
    return json({ ok: true, plan, effectiveFrom, versions: rows.results.map((row) => ({ effectiveFrom: row.effective_from, plan: safeJson(row.plan_json, normalizeWeeklyPlan({})) })) });
  }

  if (pathname === '/api/action-library' && request.method === 'GET') return json({ ok: true, parts: await ensureLibrary(db, userId) });
  if (pathname === '/api/action-library' && request.method === 'PUT') {
    const input = await body(request); const parts = normalizeActionLibrary(input.parts ?? input);
    await db.prepare(`INSERT INTO action_library (user_id,library_json,updated_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET library_json=excluded.library_json,updated_at=excluded.updated_at`).bind(userId, JSON.stringify(parts), now()).run();
    return json({ ok: true, parts });
  }

  if (pathname === '/api/day' && request.method === 'GET') {
    const date = url.searchParams.get('date') || dateInShanghai(); const plan = await planForDate(db, userId, date);
    const templateIds = plan[weekdayKeyForDate(date)] || [];
    const templates = (await Promise.all(templateIds.map((id) => templateById(db, userId, id)))).map(mapTemplate).filter(Boolean);
    const records = await listRecords(db, userId, new URLSearchParams({ date }));
    return json({ ok: true, date, plan, templateIds, templates, records });
  }
  if (pathname === '/api/schedule' && request.method === 'GET') {
    const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
    if (!from || !to) fail('from and to are required');
    const days = await Promise.all(datesBetween(from, to).map(async (date) => {
      const plan = await planForDate(db, userId, date); const templateIds = plan[weekdayKeyForDate(date)] || [];
      const templates = (await Promise.all(templateIds.map((id) => templateById(db, userId, id)))).map(mapTemplate).filter(Boolean);
      const records = await listRecords(db, userId, new URLSearchParams({ date }));
      return { date, templateIds, templates, records };
    }));
    return json({ ok: true, from, to, days });
  }
  if (pathname === '/api/calendar-events' && request.method === 'POST') return json({ ok: true, synced: false, error: 'calendar sync is not part of trainlog yet' });
  return json({ ok: false, error: 'not found' }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (url.pathname === '/health') return json({ ok: true, service: 'trainlog', time: now(), mode: env.DEV_BYPASS_AUTH === 'true' ? 'local-development' : 'authentication-required' });
    if (url.pathname === '/config.js') {
      const token = env.DEV_BYPASS_AUTH === 'true' ? env.LOCAL_DEV_TOKEN || '' : '';
      return new Response(`window.TRAINING_TOKEN = ${JSON.stringify(token)};\n`, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (error) { const appError = error as AppError; return json({ ok: false, error: appError.message || 'internal error' }, appError.status || 500); }
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
