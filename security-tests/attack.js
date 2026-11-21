// Security regression harness for the IPL Strategy Arena backend.
// Each check prints SECURE or VULNERABLE. Run against a server started with
// ALLOW_TEST_HELPER=true and the same JWT_SECRET as below.
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const BASE = process.env.BASE || 'http://localhost:3101';
const SECRET = process.env.JWT_SECRET;
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(name, secure, detail) {
  results.push({ name, secure, detail });
  console.log(`${secure ? 'SECURE    ' : 'VULNERABLE'} | ${name} | ${detail}`);
}

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function connect(token, extra = {}) {
  return new Promise((resolve) => {
    const s = io(BASE, { transports: ['websocket'], reconnection: false, auth: token ? { token } : {}, ...extra });
    s.on('connect', () => resolve({ socket: s, ok: true }));
    s.on('connect_error', (err) => resolve({ socket: s, ok: false, err: err.message }));
  });
}

async function register(name) {
  const r = await call('POST', '/auth/register', null, { username: name, password: 'password123' });
  if (r.status !== 200) throw new Error(`register ${name} failed: ${JSON.stringify(r.data)}`);
  return r.data;
}

(async () => {
  const tag = Math.random().toString(36).slice(2, 7);
  const A = await register(`alice_${tag}`);
  const B = await register(`bob_${tag}`);
  const C = await register(`carl_${tag}`); // outsider

  const created = await call('POST', '/game/session', A.token);
  const sid = created.data.session.session.id;
  const code = created.data.session.session.inviteCode;
  await call('POST', '/game/session/join', B.token, { inviteCode: code });
  const seeded = await call('POST', '/game/debug/seed-session', A.token, { sessionId: sid });
  if (!seeded.data?.seeded) throw new Error('seed failed: ' + JSON.stringify(seeded));
  // Seed order depends on joined_at (1s resolution), so read real ownership.
  const owner = {};
  for (const p of seeded.data.session.players) for (const t of p.teams) owner[t.teamId] = p.id;
  const tokenFor = (uid) => (uid === A.user.id ? A.token : B.token);
  const SCHEDULE = (await call('GET', '/game/ipl-data')).data.matches;
  const contestNoResult = SCHEDULE.filter((m) => !m.result && owner[m.team1] !== owner[m.team2]);
  const sameOwnerWithResult = SCHEDULE.find((m) => m.result && owner[m.team1] === owner[m.team2]);
  const contestWithResult = SCHEDULE.find((m) => m.result && owner[m.team1] !== owner[m.team2]);

  // --- JWT checks ---------------------------------------------------------
  let r = await call('GET', '/auth/me', 'not-a-jwt');
  record('Invalid JWT (garbage)', r.status === 401, `HTTP ${r.status}`);

  const wrongKey = jwt.sign({ id: A.user.id, username: A.user.username }, 'ipl-strategy-secret-2025');
  r = await call('GET', '/auth/me', wrongKey);
  record('JWT signed with old hardcoded fallback secret', r.status === 401, `HTTP ${r.status}`);

  const noneAlg = jwt.sign({ id: A.user.id, username: A.user.username }, null, { algorithm: 'none' });
  r = await call('GET', '/auth/me', noneAlg);
  record('Unsigned alg=none JWT', r.status === 401, `HTTP ${r.status}`);

  const expired = jwt.sign({ id: A.user.id, username: A.user.username, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
  r = await call('GET', '/auth/me', expired);
  record('Expired JWT', r.status === 401, `HTTP ${r.status}`);

  // --- Socket auth --------------------------------------------------------
  const anon = await connect(null);
  record('Unauthenticated socket connection', !anon.ok, anon.ok ? 'connected' : `rejected: ${anon.err}`);
  anon.socket.close();

  const expSock = await connect(expired);
  record('Socket connection with expired JWT', !expSock.ok, expSock.ok ? 'connected' : `rejected: ${expSock.err}`);
  expSock.socket.close();

  const sa = (await connect(A.token)).socket;
  const sb = (await connect(B.token)).socket;
  sa.emit('join-session', { sessionId: sid, userId: A.user.id, username: A.user.username });
  sb.emit('join-session', { sessionId: sid, userId: B.user.id, username: B.user.username });
  await sleep(500);

  // Outsider tries to join the room while impersonating Bob.
  const aSaw = [];
  sa.on('player-joined', (d) => aSaw.push(d));
  const scRes = await connect(C.token);
  const outsiderEvents = [];
  if (scRes.ok) {
    scRes.socket.onAny((ev, payload) => { if (ev !== 'join-error') outsiderEvents.push(ev); });
    scRes.socket.emit('join-session', { sessionId: sid, userId: B.user.id, username: B.user.username });
  }
  await sleep(700);
  const forged = aSaw.find((d) => d.username === B.user.username || d.userId === B.user.id);
  record('Forged userId/username on socket join', !forged, forged ? `Alice was told "${forged.username} joined" by an outsider` : 'no forged presence event');

  // Client-originated fake game event.
  const bSaw = [];
  sb.onAny((ev, payload) => bSaw.push({ ev, payload }));
  sa.emit('match-processed', { sessionId: sid, matchId: 'm05', winnerName: 'HACKER', points: 999 });
  sa.emit('state-update', { sessionId: sid, event: 'x', data: {} });
  sa.emit('team-bought', { sessionId: sid, teamId: 'csk', userId: A.user.id, username: 'HACKER', price: 0 });
  await sleep(700);
  const fake = bSaw.find((e) => JSON.stringify(e.payload || {}).includes('HACKER') || e.ev === 'state-update');
  record('Client-triggered fake Socket.IO game events', !fake, fake ? `Bob received "${fake.ev}": ${JSON.stringify(fake.payload).slice(0, 80)}` : 'no relayed events');

  // --- HTTP session authorization -----------------------------------------
  r = await call('GET', `/game/matches/${sid}`, C.token);
  record('Outsider reads another session (GET /matches/:id)', r.status === 403, `HTTP ${r.status}`);

  r = await call('POST', '/game/finalize-auction', C.token, { sessionId: sid });
  record('Outsider finalizes another session', r.status === 403, `HTTP ${r.status}`);

  const m7 = contestNoResult[1];
  r = await call('POST', '/game/process-match', C.token, { sessionId: sid, matchId: m7.id, winnerTeamId: m7.team1 });
  record('Outsider processes a match in another session', r.status === 403, `HTTP ${r.status} ${r.data?.message || r.data?.error || ''}`);

  // --- Forged winner --------------------------------------------------------
  const m5 = contestNoResult[0];
  r = await call('POST', '/game/process-match', tokenFor(owner[m5.team1]), { sessionId: sid, matchId: m5.id, winnerTeamId: m5.team1 });
  record('Player submits their own team as match winner', r.status >= 400, `HTTP ${r.status} ${r.data?.message || r.data?.error || ''}`);

  // --- Concurrency ----------------------------------------------------------
  const cm = contestWithResult;
  const bodies = [];
  for (let i = 0; i < 25; i++) {
    bodies.push(i % 2 ? { sessionId: sid, matchId: cm.id } : { sessionId: sid, matchId: cm.id, winnerTeamId: cm.result.winner });
  }
  await Promise.all([
    ...bodies.map((b, i) => call('POST', '/game/process-match', i % 3 ? A.token : B.token, b)),
    call('GET', `/game/matches/${sid}`, A.token),
    call('GET', `/game/matches/${sid}`, B.token),
  ]);
  const ms = await call('GET', `/game/matches/${sid}`, A.token);
  const rows = ms.data.results.filter((x) => x.match_id === cm.id);
  const awarded = ms.data.results.reduce((acc, x) => acc + x.points_to_winner + x.points_to_loser, 0);
  const pa = (await call('GET', '/auth/me', A.token)).data.user.points;
  const pb = (await call('GET', '/auth/me', B.token)).data.user.points;
  record('Concurrent writes: one result row, points match ledger', rows.length === 1 && pa + pb === awarded,
    `rows for ${cm.id}=${rows.length}, user points=${pa + pb}, ledger points=${awarded}`);

  // --- Invalid state transitions ------------------------------------------
  const so = sameOwnerWithResult;
  r = await call('POST', '/game/match-choice', tokenFor(owner[so.team1]), { sessionId: sid, matchId: so.id, chosenTeamId: so.result.winner });
  record('Pick a side after the result is already known', r.status >= 400, `HTTP ${r.status} ${r.data?.error || ''}`);

  r = await call('POST', '/game/bid', A.token, { sessionId: sid, teamId: 'csk', amount: 5 });
  record('Bid after the season has started', r.status >= 400, `HTTP ${r.status} ${r.data?.error || ''}`);

  const cs = await call('POST', '/game/session', C.token);
  const csid = cs.data.session.session.id;
  r = await call('POST', '/game/home-team', C.token, { sessionId: csid, teamId: 'not-a-team' });
  record('Claim a team id that does not exist', r.status === 400, `HTTP ${r.status} ${r.data?.error || ''}`);

  r = await call('POST', '/game/home-team', C.token, { sessionId: csid, teamId: { $ne: 1 } });
  record('Non-string teamId payload', r.status === 400, `HTTP ${r.status} ${r.data?.error || ''}`);

  // --- Admin forging --------------------------------------------------------
  r = await call('POST', '/game/admin/match-result', A.token, { matchId: m5.id, winnerTeamId: m5.team1, role: 'admin', isAdmin: true });
  record('Player calls admin result route with forged role', r.status === 403 || r.status === 404, `HTTP ${r.status} ${r.data?.error || ''}`);

  const forgedAdmin = jwt.sign({ id: A.user.id, username: A.user.username, role: 'admin' }, SECRET);
  r = await call('POST', '/game/admin/match-result', forgedAdmin, { matchId: m5.id, winnerTeamId: m5.team1 });
  record('JWT carrying role=admin claim (validly signed)', r.status === 403 || r.status === 404, `HTTP ${r.status} ${r.data?.error || ''}`);

  r = await call('POST', '/auth/register', null, { username: `dave_${tag}`, password: 'password123', role: 'admin' });
  const daveRole = r.data?.user?.role;
  record('Register with role=admin in body', r.status === 400 || daveRole !== 'admin', `HTTP ${r.status} role=${daveRole}`);

  r = await call('GET', '/game/admin/matches', C.token);
  record('Player reads the admin match overview', r.status === 403, `HTTP ${r.status} ${r.data?.error || ''}`);

  r = await call('GET', '/game/leaderboard', C.token);
  record('Player lists every account on the site (old leaderboard)', r.status === 404, `HTTP ${r.status}`);

  // --- Legit flows still work (functional regression) ----------------------
  const D = await register(`dina_${tag}`);
  const E = await register(`eli_${tag}`);
  const ds = await call('POST', '/game/session', D.token);
  const dsid = ds.data.session.session.id;
  r = await call('POST', '/game/session/join', E.token, { inviteCode: ds.data.session.session.inviteCode.toLowerCase() });
  record('[functional] Join with invite code', r.status === 200, `HTTP ${r.status}`);
  r = await call('POST', '/game/home-team', D.token, { sessionId: dsid, teamId: 'csk' });
  const r2 = await call('POST', '/game/home-team', E.token, { sessionId: dsid, teamId: 'mi' });
  record('[functional] Both players pick home teams', r.status === 200 && r2.status === 200, `HTTP ${r.status}/${r2.status}`);
  const st = await call('GET', '/game/session', D.token);
  const active = st.data.session.auction?.activeTeamId;
  r = await call('POST', '/game/bid', D.token, { sessionId: dsid, teamId: active, amount: 10 });
  record('[functional] Bid on active auction team', r.status === 200 && r.data.accepted, `team=${active} HTTP ${r.status}`);
  r = await call('POST', '/game/bid', D.token, { sessionId: dsid, teamId: active, amount: 1.5 });
  record('Fractional bid amount', r.status === 400, `HTTP ${r.status} ${r.data?.error || ''}`);
  r = await call('POST', '/game/bid', D.token, { sessionId: dsid, teamId: active, amount: 5, userId: E.user.id });
  record('Forged userId in HTTP body', r.status === 400, `HTTP ${r.status} ${r.data?.error || ''}`);

  // --- Admin positive path --------------------------------------------------
  if (process.env.SETUP_JS) {
    require('child_process').execFileSync('node', [process.env.SETUP_JS, '--admin', A.user.username], { stdio: 'ignore' });
    const m9 = contestNoResult[2];
    r = await call('POST', '/game/admin/match-result', A.token, { matchId: m9.id, winnerTeamId: m9.team2 });
    record('[functional] Real admin sets an official result', r.status === 200, `HTTP ${r.status} ${r.data?.error || ''}`);
    r = await call('POST', '/game/admin/match-result', A.token, { matchId: m9.id, winnerTeamId: m9.team1 });
    record('Admin overwrites an established result', r.status === 409, `HTTP ${r.status} ${r.data?.error || ''}`);
    r = await call('POST', '/game/process-match', B.token, { sessionId: sid, matchId: m9.id });
    const applied = await call('GET', `/game/matches/${sid}`, B.token);
    const row = applied.data.matches.find((m) => m.id === m9.id);
    record('[functional] Official result is applied to the session', row.processed && row.result.winner === m9.team2, `processed=${row.processed} winner=${row.result?.winner}`);
    r = await call('GET', '/game/admin/matches', A.token);
    const ov = r.data?.matches?.find((m) => m.id === m9.id);
    record('[functional] Admin overview shows the admin result', r.status === 200 && ov?.status === 'decided' && ov?.source === 'admin' && ov?.enteredBy === A.user.username,
      `HTTP ${r.status} status=${ov?.status} source=${ov?.source}`);
  }

  // --- ADMIN_USERNAMES env var ----------------------------------------------
  // Start the server AND this harness with the same ADMIN_USERNAMES (fresh DB: the name is fixed).
  const envAdmin = (process.env.ADMIN_USERNAMES || '').split(',')[0].trim();
  if (envAdmin) {
    const EA = await register(envAdmin);
    const me = await call('GET', '/auth/me', EA.token);
    r = await call('GET', '/game/live-status', EA.token);
    record('[functional] ADMIN_USERNAMES account is admin after register', me.data?.user?.role === 'admin' && r.status !== 403,
      `role=${me.data?.user?.role} live-status HTTP ${r.status}`);
    r = await call('GET', '/game/admin/matches', EA.token);
    const needs = (r.data?.matches || []).filter((m) => m.status === 'needs-result').length;
    record('[functional] Admin who is in no game reads the match overview', r.status === 200 && Array.isArray(r.data?.matches),
      `HTTP ${r.status} matches=${r.data?.matches?.length} needs-result=${needs}`);

    const swapped = [...envAdmin].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join('');
    if (swapped !== envAdmin) {
      const lookalike = await register(swapped);
      r = await call('GET', '/game/live-status', lookalike.token);
      record('Different-case lookalike of an ADMIN_USERNAMES name', r.status === 403, `HTTP ${r.status} ${r.data?.error || ''}`);
    }
  }

  // Outsider room membership, evaluated last so it covers every broadcast above.
  record('Outsider receives events from a room it is not in', outsiderEvents.length === 0,
    outsiderEvents.length ? `received: ${[...new Set(outsiderEvents)].join(', ')}` : 'received nothing');

  sa.close(); sb.close(); scRes.socket.close();
  const bad = results.filter((x) => !x.secure).length;
  console.log(`\n${results.length - bad}/${results.length} secure, ${bad} vulnerable`);
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
