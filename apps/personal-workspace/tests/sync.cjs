// Sync test: several browsers against an in-memory fake of Supabase Auth + PostgREST
// that mirrors migration 26 (per-user isolation, last-write-wins guard, tombstones,
// database-assigned server_updated_at). Requires Playwright. Run: node tests/sync.cjs
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const BASE = 'https://fake.supabase.test';
const KEY = 'pk-test';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, prefer, accept', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' };

/* ---------- fake backend ---------- */
const users = new Map(); // email -> { id, password }
const tokens = new Map(); // access token -> uid
const refresh = new Map(); // refresh token -> uid
const store = new Map(); // uid -> Map("kind:id" -> row)
const stats = { refreshes: 0, rejected: 0 };
let micros = Date.now() * 1000, seq = 0;
const stamp = () => { micros += 1000 + Math.floor(Math.random() * 500); const ms = Math.floor(micros / 1000); return new Date(ms).toISOString().slice(0, -1) + String(micros % 1000).padStart(3, '0') + '+00:00'; };
const rowsOf = (uid) => (store.has(uid) ? [...store.get(uid).values()] : []);
function session(uid, email, expiresIn) {
  const access_token = `acc-${uid}-${++seq}`, refresh_token = `ref-${uid}-${seq}`;
  tokens.set(access_token, uid); refresh.set(refresh_token, uid);
  return { access_token, refresh_token, expires_in: expiresIn, token_type: 'bearer', user: { id: uid, email } };
}

async function attach(context, flags) {
  await context.route('https://api.pwnedpasswords.com/range/*', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Add-Padding', 'access-control-allow-methods': 'GET' } });
    if (flags.pwnedDown) return route.abort('internetdisconnected');
    if (flags.pwnedStall) { setTimeout(() => route.abort().catch(() => {}), 30000); return; } // accepts the request, never answers
    pwnedUrls.push(req.url());
    const prefix = req.url().split('/').pop(), lines = ['0000000000000000000000000000000000A:0'];
    if (prefix === BREACHED.slice(0, 5)) lines.unshift(`${BREACHED.slice(5)}:48213`);
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: lines.join('\r\n') });
  });
  await context.route(`${BASE}/**`, async (route) => {
    const req = route.request(), url = new URL(req.url()), h = req.headers();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (flags.offline) return route.abort('internetdisconnected');
    const send = (status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
    if (h.apikey !== KEY) return send(401, { message: 'Invalid API key' });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const p = url.pathname;

    if (p === '/auth/v1/signup') {
      if (users.has(body.email)) return send(200, { id: 'obfuscated', email: body.email }); // like real Supabase: no session
      const id = `user-${users.size + 1}`; users.set(body.email, { id, password: body.password });
      return send(200, session(id, body.email, flags.expiresIn || 3600));
    }
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return send(400, { error_description: 'Invalid login credentials' });
      return send(200, session(u.id, body.email, flags.expiresIn || 3600));
    }
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const uid = refresh.get(body.refresh_token);
      if (!uid) return send(400, { error_description: 'Invalid Refresh Token' });
      stats.refreshes++; return send(200, session(uid, [...users].find(([, v]) => v.id === uid)[0], flags.expiresIn || 3600));
    }
    if (p === '/auth/v1/logout') return send(204);

    // everything below needs a valid user token (RLS stand-in)
    const uid = tokens.get((h.authorization || '').replace('Bearer ', ''));
    if (!uid || flags.reject401Once) { flags.reject401Once = false; stats.rejected++; return send(401, { message: 'JWT expired' }); }
    const mine = store.get(uid) || store.set(uid, new Map()).get(uid);

    if (p === '/rest/v1/rpc/workspace_push') {
      const items = body.items; let written = 0;
      assert(Array.isArray(items) && items.length <= 500, 'bad push payload');
      const newest = new Map();
      for (const it of items) { const k = `${it.kind}:${it.id}`; if (!newest.has(k) || it.client_updated_at > newest.get(k).client_updated_at) newest.set(k, it); }
      for (const [k, it] of newest) {
        const old = mine.get(k);
        if (old && !(it.client_updated_at >= old.client_updated_at)) continue; // the LWW guard
        mine.set(k, { kind: it.kind, id: it.id, data: it.deleted ? {} : it.data, deleted: !!it.deleted, client_updated_at: it.client_updated_at, server_updated_at: stamp() });
        written++;
      }
      return send(200, written);
    }
    if (p === '/rest/v1/workspace_items' && req.method() === 'GET') {
      const gte = (url.searchParams.get('server_updated_at') || '').replace(/^gte\./, '');
      const limit = Number(url.searchParams.get('limit') || 1000);
      const rows = rowsOf(uid).filter((r) => !gte || r.server_updated_at >= gte).sort((a, b) => (a.server_updated_at < b.server_updated_at ? -1 : 1)).slice(0, limit);
      return send(200, rows);
    }
    if (p === '/rest/v1/workspace_items' && req.method() === 'DELETE') {
      assert.strictEqual(url.searchParams.get('user_id'), `eq.${uid}`, 'delete must be scoped to the caller');
      store.set(uid, new Map()); return send(204);
    }
    return send(404, { message: 'not found: ' + p });
  });
}

/* fake of the HaveIBeenPwned range API: one known-breached password, padded decoys like the real service */
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').toUpperCase();
const BREACHED = sha1('password1234');
const pwnedUrls = [];

/* ---------- helpers ---------- */
const APP = 'file://' + path.resolve(process.env.APP_FILE || path.join(__dirname, '../index.html'));
async function device(browser, name) {
  const context = await browser.newContext(), flags = {}, page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await attach(context, flags);
  await page.goto(APP);
  await page.waitForSelector('text=Getting started');
  return { name, context, flags, page, errors };
}
async function signIn(d, email, password, mode = 'Sign in') {
  const p = d.page;
  await p.goto(APP + '#/settings');
  await p.fill('input[placeholder="https://your-project.supabase.co"]', BASE);
  await p.fill('input[placeholder^="sb_publishable"]', KEY);
  await p.fill('input[aria-label="Email"]', email);
  await p.fill('input[aria-label="Password"]', password);
  await p.click(`main button:has-text("${mode}")`);
}
const waitSynced = (d) => d.page.waitForFunction(() => S.sync.session && S.sync.lastSync && !sync.busy, null, { timeout: 15000 });
// Run one full sync cycle, deterministically (cancels the debounce timer, waits out any run in flight).
const syncNow = (d) => d.page.evaluate(async () => { clearTimeout(sync.timer); while (sync.busy) await new Promise((r) => setTimeout(r, 20)); await syncRun(true); });
const pause = (d, ms = 450) => d.page.waitForTimeout(ms); // lets the 150 ms save debounce stamp an edit before the next one
const titles = (d) => d.page.evaluate(() => S.tasks.map((t) => t.title).sort());
const serverTitles = (uid) => rowsOf(uid).filter((r) => r.kind === 'task' && !r.deleted).map((r) => r.data.title).sort();

(async () => {
  const browser = await chromium.launch();
  const A = await device(browser, 'A'), B = await device(browser, 'B'), C = await device(browser, 'C');
  const all = [A, B, C];
  const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ev1\r\nDTSTART;VALUE=DATE:20991201\r\nSUMMARY:Grant deadline\r\nEND:VEVENT\r\nEND:VCALENDAR';

  /* 1. sign up on A; local data uploads; secrets never leave the device */
  await A.page.evaluate((ics) => {
    S.settings.apiKey = 'sk-secret-do-not-sync'; S.settings.accent = '#112233'; S.settings.theme = 'dark';
    S.tasks.push(newTask({ title: 'Alpha', due: '2099-01-10' }), newTask({ title: 'Bravo' }));
    S.projects.push({ id: 'p-one', name: 'Project One', goal: '', due: '', status: 'active' });
    addDoc('Notes', 'v1 text', ['x']); S.customAgents.push({ id: 'c-one', name: 'Mine', description: '', system: 'prompt' });
    importICS(ics); save();
  }, ICS);
  await signIn(A, 'me@example.com', 'correct-horse', 'Create account');
  await waitSynced(A);
  const uid = users.get('me@example.com').id;
  const kinds = rowsOf(uid).reduce((m, r) => ((m[r.kind] = (m[r.kind] || 0) + 1), m), {});
  assert.deepStrictEqual(kinds, { task: 3, project: 1, doc: 1, agent: 1, event: 1, settings: 1 }, 'A uploaded everything: ' + JSON.stringify(kinds));
  const blob = JSON.stringify(rowsOf(uid));
  for (const secret of ['sk-secret-do-not-sync', 'access_token', 'refresh_token', 'acc-', 'ref-', 'correct-horse']) assert(!blob.includes(secret), 'secret leaked to server: ' + secret);
  console.log('1 ok: A signed up and uploaded', JSON.stringify(kinds));

  /* 2. B signs in: gets everything; its default settings must not clobber A's */
  await signIn(B, 'me@example.com', 'correct-horse');
  await waitSynced(B);
  assert.deepStrictEqual(await titles(B), ['Alpha', 'Bravo', 'Grant deadline']);
  assert.strictEqual(await B.page.evaluate(() => S.settings.accent), '#112233', 'B adopted A settings');
  assert.strictEqual(rowsOf(uid).find((r) => r.kind === 'settings').data.accent, '#112233', "B's defaults overwrote A's settings on the server");
  assert.strictEqual(await B.page.evaluate(() => S.docs[0].versions[0].content), 'v1 text');
  assert.strictEqual(await B.page.evaluate(() => S.events.length), 1);
  await B.page.evaluate((ics) => { importICS(ics); save(); }, ICS); // same .ics on the second device
  await syncNow(B);
  assert.strictEqual(await B.page.evaluate(() => S.events.length), 1, 'event duplicated');
  assert.strictEqual(await B.page.evaluate(() => S.tasks.filter((t) => t.title === 'Grant deadline').length), 1, 'calendar task duplicated');
  assert.strictEqual(rowsOf(uid).filter((r) => r.kind === 'event').length, 1, 'duplicate event row on server');
  console.log('2 ok: B converged; settings not clobbered; event deduplicated');

  /* 3. edits and deletes propagate */
  await pause(B);
  await B.page.evaluate(() => { S.tasks.find((t) => t.title === 'Alpha').title = 'Alpha (edited on B)'; save(); });
  await pause(B); await syncNow(B); await syncNow(A);
  assert.deepStrictEqual(await titles(A), ['Alpha (edited on B)', 'Bravo', 'Grant deadline']);
  await pause(A);
  await A.page.evaluate(() => { S.tasks.splice(S.tasks.findIndex((t) => t.title === 'Bravo'), 1); save(); });
  await pause(A); await syncNow(A); await syncNow(B);
  assert.deepStrictEqual(await titles(B), ['Alpha (edited on B)', 'Grant deadline']);
  const tomb = rowsOf(uid).find((r) => r.kind === 'task' && r.deleted);
  assert(tomb && Object.keys(tomb.data).length === 0, 'tombstone should keep no content');
  console.log('3 ok: edit and delete propagate; tombstone empty');

  /* 4. conflicts resolve last-write-wins, both directions */
  const alpha = await A.page.evaluate(() => S.tasks.find((t) => t.title.startsWith('Alpha')).id);
  const setTitle = (d, title) => d.page.evaluate(([id, t]) => { S.tasks.find((x) => x.id === id).title = t; save(); }, [alpha, title]);
  const alphaOn = (d) => d.page.evaluate((id) => S.tasks.find((x) => x.id === id).title, alpha);
  const alphaServer = () => rowsOf(uid).find((r) => r.kind === 'task' && r.id === alpha).data.title;
  A.flags.offline = true; await pause(A);
  await setTitle(A, 'A edited offline (older)');
  await pause(A);
  await setTitle(B, 'B edited later (newer)');
  await pause(B); await syncNow(B);
  A.flags.offline = false; await syncNow(A);
  assert.strictEqual(await alphaOn(A), 'B edited later (newer)', 'older offline edit must lose');
  assert.strictEqual(alphaServer(), 'B edited later (newer)');
  await setTitle(B, 'B edit (older)'); await pause(B); await syncNow(B);
  await pause(A);
  await setTitle(A, 'A edit (newest)');
  await pause(A); await syncNow(A); await syncNow(B);
  assert.strictEqual(await alphaOn(B), 'A edit (newest)', 'newer edit must win');
  assert.strictEqual(alphaServer(), 'A edit (newest)');
  console.log('4 ok: last-write-wins in both directions');

  /* 5. offline queues, reports pending, then drains */
  B.flags.offline = true;
  await B.page.evaluate(() => { S.tasks.push(newTask({ title: 'Queued offline' })); save(); });
  await pause(B); await syncNow(B);
  assert.strictEqual(await B.page.evaluate(() => sync.state), 'offline');
  assert(await B.page.evaluate(() => syncPending()) >= 1, 'pending should be counted');
  assert((await B.page.textContent('#nav-sync')).includes('offline'), 'nav shows offline');
  B.flags.offline = false; await syncNow(B);
  assert.strictEqual(await B.page.evaluate(() => syncPending()), 0);
  assert(serverTitles(uid).includes('Queued offline'));
  await syncNow(A);
  console.log('5 ok: offline queue drains');

  /* 6. expired token refreshes; a 401 mid-flight refreshes and retries */
  const r0 = stats.refreshes;
  await A.page.evaluate(() => { S.sync.session.expires_at = Math.floor(Date.now() / 1000) - 10; });
  await syncNow(A);
  assert.strictEqual(stats.refreshes, r0 + 1, 'expired token should refresh once');
  A.flags.reject401Once = true;
  await A.page.evaluate(() => { S.tasks.push(newTask({ title: 'After 401' })); save(); });
  await pause(A); await syncNow(A);
  assert(serverTitles(uid).includes('After 401'), 'push must survive a 401 via refresh and retry');
  assert.strictEqual(stats.refreshes, r0 + 2);
  console.log('6 ok: token refresh and 401 retry');

  /* 7. automatic sync fires without a manual click */
  await B.page.evaluate(() => { S.tasks.push(newTask({ title: 'Auto synced' })); save(); });
  await B.page.waitForFunction(() => syncPending() > 0, null, { timeout: 5000 }); // change noticed (150 ms debounce)
  await B.page.waitForFunction(() => syncPending() === 0 && !sync.busy, null, { timeout: 12000 }); // then pushed by the 4 s auto timer, no manual call
  assert(serverTitles(uid).includes('Auto synced'));
  console.log('7 ok: automatic sync');

  /* 8. a second account sees nothing of the first; wrong password fails cleanly */
  await signIn(C, 'other@example.com', 'another-pass', 'Create account');
  await waitSynced(C);
  assert.deepStrictEqual(await titles(C), [], "account C must not see A's data");
  await C.page.evaluate(async () => { await syncSignOut(); render(); }); // what the Sign out button does
  await signIn(C, 'me@example.com', 'wrong-password');
  await C.page.waitForSelector('.toast:has-text("Invalid login credentials")');
  assert.strictEqual(await C.page.evaluate(() => !!S.sync.session), false);
  console.log('8 ok: isolation between accounts; bad password rejected');

  /* 8b. new-account password rules: length, known breaches, and failing open when the checker is down */
  const usersBefore = users.size;
  await signIn(C, 'weak@example.com', 'short', 'Create account');
  await C.page.waitForSelector('.toast:has-text("at least 10 characters")');
  await signIn(C, 'weak@example.com', 'password1234', 'Create account');
  await C.page.waitForSelector('.toast:has-text("known data breaches")');
  assert.strictEqual(users.size, usersBefore, 'a rejected password must not create an account');
  C.flags.pwnedDown = true;
  await signIn(C, 'open@example.com', 'a-fine-passphrase', 'Create account');
  await C.page.waitForSelector('.toast:has-text("not checked")');
  await waitSynced(C);
  assert.strictEqual(users.size, usersBefore + 1, 'sign-up must continue when the breach checker is unreachable');
  C.flags.pwnedDown = false;
  assert(pwnedUrls.length >= 3 && pwnedUrls.every((u) => /\/range\/[0-9A-F]{5}$/.test(u)), 'only a 5-character hash prefix may be sent: ' + pwnedUrls.join(' '));
  assert(!pwnedUrls.some((u) => /password|fine-passphrase|correct-horse|short/i.test(u.split('/range/')[1])), 'a password leaked into a request path');
  console.log('8b ok: length rule, breach rule, fail-open; only 5-char prefixes sent');

  /* 8c. a breach checker that never answers must not hold sign-up open */
  await C.page.evaluate(async () => { await syncSignOut(); render(); });
  C.flags.pwnedStall = true;
  const stalledAt = Date.now(), usersBeforeStall = users.size;
  await signIn(C, 'stall@example.com', 'another-fine-pass', 'Create account');
  await C.page.waitForSelector('.toast:has-text("not checked")', { timeout: 12000 });
  await waitSynced(C);
  const waited = Date.now() - stalledAt;
  assert(waited < 12000, `sign-up waited ${waited} ms on a stalled checker`);
  assert.strictEqual(users.size, usersBeforeStall + 1, 'sign-up must continue after the checker times out');
  C.flags.pwnedStall = false;
  console.log(`8c ok: stalled breach checker gave up after ~${Math.round(waited / 1000)} s and sign-up continued`);

  /* 9. backups carry no sign-in state; sign-out keeps local data; delete-cloud wipes the cloud only */
  const exp = await A.page.evaluate(() => JSON.stringify(exportable()));
  for (const bad of ['access_token', 'refresh_token', 'acc-', 'sk-secret-do-not-sync']) assert(!exp.includes(bad), 'backup leaked ' + bad);
  await A.page.evaluate(() => syncDeleteCloud());
  assert.strictEqual(rowsOf(uid).length, 0, 'cloud should be empty');
  assert((await titles(A)).length > 0, 'local data must survive delete-cloud');
  assert.strictEqual(await A.page.evaluate(() => S.sync.auto), false);
  await A.page.evaluate(() => syncSignOut());
  assert.strictEqual(await A.page.evaluate(() => syncActive()), false);
  assert((await titles(A)).length > 0, 'local data must survive sign-out');
  console.log('9 ok: backups clean; sign-out and delete-cloud behave');

  /* 10. state survives a reload (session, meta) */
  await B.page.waitForTimeout(400); await B.page.reload(); await B.page.waitForFunction(() => typeof S !== 'undefined' && S.sync.session);
  assert.strictEqual(await B.page.evaluate(() => syncActive()), true);

  const errors = all.flatMap((d) => d.errors);
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('; '));
  await browser.close();
  console.log('sync: OK');
})().catch((e) => { console.error(e); process.exit(1); });
