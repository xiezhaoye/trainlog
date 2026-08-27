import { DEFAULT_ACTION_LIBRARY, normalizeActionLibrary, normalizeWeeklyPlan, WEEKDAY_KEYS } from '../shared/training';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_KV: KVNamespace;
  DEV_BYPASS_AUTH?: string;
  LOCAL_DEV_TOKEN?: string;
  AUTH_DEV_SHOW_CODE?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

type Row = Record<string, unknown>;
type AppError = Error & { status?: number };

const json = (payload: unknown, status = 200, headers: HeadersInit = {}) => Response.json(payload, {
  status,
  headers: { 'cache-control': 'no-store', ...headers }
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
      actions: safeJson(row.resistance_exercises, []), createdAt: Date.parse(String(row.created_at))
    };
  }
  const base: Record<string, unknown> = {
    id: row.id, date: row.date, type: row.type, templateId: row.template_id,
    templateName: row.template_name, durationMinutes: row.duration_minutes,
    completed: Boolean(row.completed),
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

const encoder = new TextEncoder();
const OTP_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SHORT_SESSION_TTL_SECONDS = 24 * 60 * 60;
// Cloudflare Workers' PBKDF2 implementation rejects iteration counts above 100_000.
const PASSWORD_ITERATIONS = 100_000;

function emailValue(value: unknown) {
  const email = stringValue(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('请输入有效的邮箱地址');
  return email;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function passwordHash(password: string, salt?: Uint8Array) {
  const actualSalt = salt || randomBytes(16);
  const saltBuffer = actualSalt.buffer.slice(actualSalt.byteOffset, actualSalt.byteOffset + actualSalt.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: PASSWORD_ITERATIONS
  }, key, 256);
  return { salt: bytesToBase64(actualSalt), hash: bytesToBase64(new Uint8Array(bits)) };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function cookieValue(request: Request, name: string) {
  const prefix = `${name}=`;
  return (request.headers.get('cookie') || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length) || '';
}

function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `trainlog_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `trainlog_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function rateLimit(env: Env, bucket: string, max: number, windowSeconds: number) {
  const current = Number(await env.AUTH_KV.get(`rate:${bucket}`) || '0');
  if (current >= max) fail('操作过于频繁，请稍后再试', 429);
  await env.AUTH_KV.put(`rate:${bucket}`, String(current + 1), { expirationTtl: windowSeconds });
}

async function turnstile(input: Record<string, unknown>, request: Request, env: Env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.DEV_BYPASS_AUTH === 'true') return;
    fail('认证安全校验尚未配置', 503);
  }
  const token = stringValue(input.turnstileToken);
  if (!token) fail('请先完成人机验证');
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const result = await response.json().catch(() => ({})) as { success?: boolean };
  if (!response.ok || !result.success) fail('人机验证失败，请重试');
}

async function challengeKey(email: string, purpose: 'signup' | 'login') {
  return `otp:${purpose}:${await sha256(email)}`;
}

async function issueOtp(email: string, purpose: 'signup' | 'login', env: Env) {
  await rateLimit(env, `send:${purpose}:${await sha256(email)}`, 5, 15 * 60);
  const code = randomCode();
  const key = await challengeKey(email, purpose);
  await env.AUTH_KV.put(key, JSON.stringify({ digest: await sha256(code), attempts: 0, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 }), { expirationTtl: OTP_TTL_SECONDS });

  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || 'TrainLog <onboarding@resend.dev>', to: [email],
        subject: 'TrainLog 登录验证码',
        html: `<p>你的 TrainLog 验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 5 分钟内有效。若非本人操作，请忽略此邮件。</p>`
      })
    });
    if (!response.ok) fail('验证码邮件发送失败，请稍后再试', 503);
  } else if (env.DEV_BYPASS_AUTH !== 'true') {
    fail('邮件服务尚未配置', 503);
  }
  return env.AUTH_DEV_SHOW_CODE === 'true' ? code : undefined;
}

async function verifyOtp(email: string, purpose: 'signup' | 'login', code: unknown, env: Env) {
  const key = await challengeKey(email, purpose);
  const challenge = await env.AUTH_KV.get<{ digest: string; attempts: number; expiresAt: number }>(key, 'json');
  const provided = stringValue(code);
  if (!challenge || challenge.expiresAt <= Date.now()) fail('验证码已过期，请重新获取');
  if (challenge.attempts >= 5) { await env.AUTH_KV.delete(key); fail('验证码尝试次数过多，请重新获取'); }
  if (!constantTimeEqual(challenge.digest, await sha256(provided))) {
    await env.AUTH_KV.put(key, JSON.stringify({ ...challenge, attempts: challenge.attempts + 1 }), {
      expirationTtl: Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000))
    });
    fail('验证码不正确');
  }
  await env.AUTH_KV.delete(key);
}

async function createSession(request: Request, env: Env, user: Row, remember: boolean) {
  const token = bytesToBase64(randomBytes(32)).replace(/[+/=]/g, '');
  const ttl = remember ? SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS;
  await env.AUTH_KV.put(`session:${token}`, JSON.stringify({ userId: user.id, email: user.email }), { expirationTtl: ttl });
  return sessionCookie(request, token, ttl);
}

async function sessionUser(request: Request, env: Env) {
  const token = cookieValue(request, 'trainlog_session');
  if (!token) return null;
  const session = await env.AUTH_KV.get<{ userId: string; email: string }>(`session:${token}`, 'json');
  if (!session) return null;
  return env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?').bind(session.userId).first<Row>();
}

async function localDevelopmentUser(env: Env) {
  const stamp = now();
  await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind('local-dev-user', 'local@trainlog.life', 'Local Developer', stamp, stamp).run();
  return env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?').bind('local-dev-user').first<Row>();
}

async function requireUser(request: Request, env: Env) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (env.DEV_BYPASS_AUTH === 'true' && supplied && supplied === env.LOCAL_DEV_TOKEN) {
    await localDevelopmentUser(env);
    return 'local-dev-user';
  }
  const user = await sessionUser(request, env);
  if (user?.id) return String(user.id);
  return fail('请先登录', 401);
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
    completed: input.completed === undefined ? Number(previous?.completed ?? 0) : (input.completed ? 1 : 0),
    mood: nullableNumber(input.mood ?? previous?.mood), session: session ? 1 : 0
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

async function userByEmail(db: D1Database, email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<Row>();
}

function publicUser(user: Row) {
  return { id: user.id, email: user.email, displayName: user.display_name || null };
}

async function authApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/auth/')) return null;

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const user = await sessionUser(request, env) || (env.DEV_BYPASS_AUTH === 'true' ? await localDevelopmentUser(env) : null);
    if (!user) return json({ ok: false, error: '请先登录' }, 401);
    return json({ ok: true, user: publicUser(user) });
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const token = cookieValue(request, 'trainlog_session');
    if (token) await env.AUTH_KV.delete(`session:${token}`);
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(request) });
  }

  if (pathname === '/api/auth/signup/send-code' && request.method === 'POST') {
    const input = await body(request); await turnstile(input, request, env);
    const email = emailValue(input.email); const existing = await userByEmail(env.DB, email);
    if (existing) return json({ ok: true, message: '若该邮箱可注册，验证码已发送' });
    const devCode = await issueOtp(email, 'signup', env);
    return json({ ok: true, expiresIn: OTP_TTL_SECONDS, ...(devCode ? { devCode } : {}) });
  }

  if (pathname === '/api/auth/login/send-code' && request.method === 'POST') {
    const input = await body(request); await turnstile(input, request, env);
    const email = emailValue(input.email); const existing = await userByEmail(env.DB, email);
    if (!existing) return json({ ok: true, message: '若该邮箱已注册，验证码已发送' });
    const devCode = await issueOtp(email, 'login', env);
    return json({ ok: true, expiresIn: OTP_TTL_SECONDS, ...(devCode ? { devCode } : {}) });
  }

  if (pathname === '/api/auth/signup' && request.method === 'POST') {
    const input = await body(request); const email = emailValue(input.email); const password = String(input.password || '');
    if (password.length < 4) fail('登录密码至少 4 个字符');
    if (await userByEmail(env.DB, email)) fail('该邮箱已注册，请直接登录', 409);
    await verifyOtp(email, 'signup', input.code, env);
    const derived = await passwordHash(password); const stamp = now();
    const user: Row = { id: uid(), email, display_name: null };
    await env.DB.prepare(`INSERT INTO users (id,email,display_name,password_hash,password_salt,password_kdf,email_verified_at,last_login_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(user.id, email, null, derived.hash, derived.salt, `PBKDF2-SHA-256/${PASSWORD_ITERATIONS}`, stamp, stamp, stamp, stamp).run();
    await ensureLibrary(env.DB, String(user.id));
    const cookie = await createSession(request, env, user, true);
    return json({ ok: true, user: publicUser(user) }, 201, { 'set-cookie': cookie });
  }

  if (pathname === '/api/auth/login/password' && request.method === 'POST') {
    const input = await body(request); const email = emailValue(input.email); const password = String(input.password || '');
    await rateLimit(env, `password:${await sha256(email)}`, 10, 15 * 60);
    const user = await userByEmail(env.DB, email);
    if (!user?.password_hash || !user.password_salt) fail('邮箱或密码不正确', 401);
    const derived = await passwordHash(password, base64ToBytes(String(user.password_salt)));
    if (!constantTimeEqual(derived.hash, String(user.password_hash))) fail('邮箱或密码不正确', 401);
    await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now(), now(), user.id).run();
    const cookie = await createSession(request, env, user, input.remember !== false);
    return json({ ok: true, user: publicUser(user) }, 200, { 'set-cookie': cookie });
  }

  if (pathname === '/api/auth/login/code' && request.method === 'POST') {
    const input = await body(request); const email = emailValue(input.email); const user = await userByEmail(env.DB, email);
    if (!user) fail('验证码不正确或账号不存在', 401);
    await verifyOtp(email, 'login', input.code, env);
    await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now(), now(), user.id).run();
    const cookie = await createSession(request, env, user, input.remember !== false);
    return json({ ok: true, user: publicUser(user) }, 200, { 'set-cookie': cookie });
  }

  return json({ ok: false, error: 'not found' }, 404);
}

async function staticPage(request: Request, env: Env, path: string, injectAuthBridge = false) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = path;
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!injectAuthBridge || !response.ok) return response;
  const markup = await response.text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  const authConfig = `<script>window.TRAINLOG_TURNSTILE_SITE_KEY=${JSON.stringify(env.TURNSTILE_SITE_KEY || '')};</script>`;
  return new Response(markup.replace('</body>', `${authConfig}<script src="/auth-bridge.js"></script></body>`), {
    status: response.status, headers
  });
}

async function api(request: Request, env: Env, url: URL) {
  const authResponse = await authApi(request, env, url);
  if (authResponse) return authResponse;
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
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, userId, fields.date, fields.type, fields.templateId, fields.templateName, fields.cardioAction, fields.cardioSpeed, fields.cardioDuration, fields.exercises, fields.duration, 0, fields.completed, fields.mood, fields.session, null, stamp, stamp).run();
    return json({ ok: true, record: mapRecord(await recordById(db, userId, id)) }, 201);
  }
  const recordMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
  if (recordMatch) {
    const id = decodeURIComponent(recordMatch[1]); const previous = await recordById(db, userId, id);
    if (!previous) return json({ ok: false, error: 'record not found' }, 404);
    if (request.method === 'GET') return json({ ok: true, record: mapRecord(previous) });
    if (request.method === 'PUT' || request.method === 'PATCH') {
      const fields = recordFields(await body(request), previous);
      await db.prepare(`UPDATE records SET date=?,type=?,template_id=?,template_name=?,cardio_action=?,cardio_speed=?,cardio_duration=?,resistance_exercises=?,duration_minutes=?,sync_calendar=0,completed=?,mood=?,session=?,calendar_json=NULL,updated_at=? WHERE user_id=? AND id=?`)
        .bind(fields.date, fields.type, fields.templateId, fields.templateName, fields.cardioAction, fields.cardioSpeed, fields.cardioDuration, fields.exercises, fields.duration, fields.completed, fields.mood, fields.session, now(), userId, id).run();
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
    // 设计稿保留为原始 HTML；只在 Worker 层映射无扩展名的公开路由，
    // 不改动设计文件本身的内容或相对 Logo/manifest 引用。
    const publicPages: Record<string, { path: string; bridge?: boolean }> = {
      '/': { path: '/index.html' },
      '/login': { path: '/login.html', bridge: true },
      '/login.html': { path: '/login.html', bridge: true },
      '/signup': { path: '/signup.html', bridge: true },
      '/signup.html': { path: '/signup.html', bridge: true },
      '/app': { path: '/app.html' },
      '/app.html': { path: '/app.html' }
    };
    const staticRoute = publicPages[url.pathname];
    if (staticRoute) {
      if (staticRoute.path === '/app.html' && env.DEV_BYPASS_AUTH !== 'true' && !await sessionUser(request, env)) {
        return Response.redirect(new URL('/login', url).toString(), 302);
      }
      return staticPage(request, env, staticRoute.path, staticRoute.bridge);
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
