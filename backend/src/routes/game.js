const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { IPL_TEAMS, MATCH_SCHEDULE } = require('../db/iplData');
const { getEffectiveSchedule, getLiveDiagnostics } = require('../services/liveScores');

const router = express.Router();
const MAX_TEAMS = 5;
const STARTING_CREDITS = 100;
const AUCTION_ROUND_SECONDS = 20;
const ALLOW_TEST_HELPER = (process.env.ALLOW_TEST_HELPER || '').trim().toLowerCase() === 'true';

// ---------------------------------------------------------------------------
// Input validation helpers. Every client value is untrusted.
// ---------------------------------------------------------------------------
const VALID_TEAM_IDS = new Set(IPL_TEAMS.map(t => t.id));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MATCH_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const INVITE_CODE_RE = /^[A-Z0-9]{1,12}$/;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isMatchId = (v) => typeof v === 'string' && MATCH_ID_RE.test(v);
const isTeamId = (v) => typeof v === 'string' && VALID_TEAM_IDS.has(v);
const todayUtc = () => new Date().toISOString().slice(0, 10);

// Reject any body field the route does not expect (e.g. userId, winnerTeamId, role, credits).
function allowFields(allowed) {
  return (req, res, next) => {
    const body = req.body ?? {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }
    const unexpected = Object.keys(body).filter(k => !allowed.includes(k));
    if (unexpected.length) {
      return res.status(400).json({ error: `Unexpected field(s): ${unexpected.join(', ')}` });
    }
    next();
  };
}

// Authorization: the JWT user must be a player in this exact session.
// Non-members get 403 whether or not the session exists, so IDs can't be probed.
function requireSessionMember({ from = 'body', allowedStatuses = null } = {}) {
  return (req, res, next) => {
    const sessionId = from === 'params' ? req.params.sessionId : req.body?.sessionId;
    if (!isUuid(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
    const row = db.prepare(`
      SELECT gs.* FROM session_players sp JOIN game_sessions gs ON gs.id = sp.session_id
      WHERE sp.session_id = ? AND sp.user_id = ?
    `).get(sessionId, req.user.id);
    if (!row) return res.status(403).json({ error: 'Not a member of this session' });
    if (allowedStatuses && !allowedStatuses.includes(row.status)) {
      return res.status(409).json({ error: `Not allowed while the session is '${row.status}'` });
    }
    req.gameSession = row;
    next();
  };
}

// Server-originated realtime events. Call only after the DB write has committed.
function broadcast(req, sessionId, event, payload) {
  const io = req.app.get('io');
  if (io) io.to(`session:${sessionId}`).emit(event, payload);
}

function usernameOf(userId) {
  return db.prepare('SELECT username FROM users WHERE id = ?').get(userId)?.username || 'A player';
}

function teamShort(teamId) {
  return IPL_TEAMS.find(t => t.id === teamId)?.short || String(teamId).toUpperCase();
}

function teamCount(sessionId, userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM team_ownerships WHERE session_id = ? AND user_id = ?').get(sessionId, userId).c;
}

// The only sources of match outcomes: the static seed / live provider (liveScores.js),
// then an admin-entered official result. Clients never supply outcomes.
async function getTrustedSchedule() {
  const schedule = await getEffectiveSchedule();
  const official = new Map(db.prepare('SELECT * FROM official_results').all().map(r => [r.match_id, r]));
  return schedule.map((m) => {
    if (extractOutcome(m)) return m;
    const o = official.get(m.id);
    if (!o) return m;
    return { ...m, result: o.is_draw ? { isDraw: true, method: 'admin' } : { winner: o.winner_team, method: 'admin' } };
  });
}

function getPendingBidTeam(sessionId) {
  const selections = db.prepare('SELECT * FROM home_team_selections WHERE session_id = ?').all(sessionId);
  if (selections.length < 2) return null;
  if (selections[0].team_id === selections[1].team_id) {
    const owned = db.prepare('SELECT * FROM team_ownerships WHERE session_id = ? AND team_id = ?').get(sessionId, selections[0].team_id);
    if (!owned) return selections[0].team_id;
  }
  return null;
}

function getAuctionState(sessionId) {
  return db.prepare('SELECT * FROM auction_state WHERE session_id = ?').get(sessionId);
}

function upsertAuctionState(sessionId, data) {
  db.prepare(`
    INSERT INTO auction_state (session_id, current_team_index, active_team_id, round_ends_at, status, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(session_id) DO UPDATE SET
      current_team_index = excluded.current_team_index,
      active_team_id = excluded.active_team_id,
      round_ends_at = excluded.round_ends_at,
      status = excluded.status,
      updated_at = strftime('%s','now')
  `).run(
    sessionId,
    data.currentTeamIndex ?? 0,
    data.activeTeamId ?? null,
    data.roundEndsAt ?? null,
    data.status ?? 'pending'
  );
}

function getNextAuctionTeam(sessionId, startIndex = 0) {
  const owned = new Set(
    db.prepare('SELECT team_id FROM team_ownerships WHERE session_id = ?').all(sessionId).map(r => r.team_id)
  );

  for (let i = Math.max(0, startIndex); i < IPL_TEAMS.length; i += 1) {
    const teamId = IPL_TEAMS[i].id;
    if (!owned.has(teamId)) return { teamId, teamIndex: i };
  }

  return null;
}

function bothPlayersHaveHomeTeams(sessionId) {
  const playerCount = db.prepare('SELECT COUNT(*) as c FROM session_players WHERE session_id = ?').get(sessionId)?.c || 0;
  if (playerCount < 2) return false;

  const homeCount = db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM team_ownerships WHERE session_id = ? AND is_home_team = 1').get(sessionId)?.c || 0;
  return homeCount >= 2;
}

function startAuctionIfReady(sessionId) {
  if (getPendingBidTeam(sessionId)) return;
  if (!bothPlayersHaveHomeTeams(sessionId)) return;

  const existing = getAuctionState(sessionId);
  if (existing && (existing.status === 'running' || existing.status === 'completed')) return;

  const nextTeam = getNextAuctionTeam(sessionId, existing?.current_team_index ?? 0);
  if (!nextTeam) {
    upsertAuctionState(sessionId, {
      currentTeamIndex: IPL_TEAMS.length,
      activeTeamId: null,
      roundEndsAt: null,
      status: 'completed',
    });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  upsertAuctionState(sessionId, {
    currentTeamIndex: nextTeam.teamIndex,
    activeTeamId: nextTeam.teamId,
    roundEndsAt: now + AUCTION_ROUND_SECONDS,
    status: 'running',
  });
}

function resolveActiveAuctionRound(sessionId) {
  const state = getAuctionState(sessionId);
  if (!state || state.status !== 'running' || !state.active_team_id) return null;

  const teamId = state.active_team_id;
  const allBids = db.prepare('SELECT * FROM bids WHERE session_id = ? AND team_id = ? ORDER BY amount DESC, created_at ASC').all(sessionId, teamId);
  const teamAlreadyOwned = db.prepare('SELECT id FROM team_ownerships WHERE session_id = ? AND team_id = ?').get(sessionId, teamId);

  let winnerBid = null;
  if (!teamAlreadyOwned && allBids.length > 0) {
    const validBids = allBids.filter((bid) => {
      const player = db.prepare('SELECT credits FROM session_players WHERE session_id = ? AND user_id = ?').get(sessionId, bid.user_id);
      return player && player.credits >= bid.amount && teamCount(sessionId, bid.user_id) < MAX_TEAMS;
    });
    winnerBid = validBids.length > 0 ? validBids[0] : null;
  }

  if (winnerBid) {
    db.prepare('UPDATE session_players SET credits = credits - ? WHERE session_id = ? AND user_id = ?').run(winnerBid.amount, sessionId, winnerBid.user_id);
    db.prepare('INSERT INTO team_ownerships (id, session_id, user_id, team_id, price_paid, is_home_team) VALUES (?, ?, ?, ?, ?, 0)')
      .run(uuidv4(), sessionId, winnerBid.user_id, teamId, winnerBid.amount);
  }

  db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ?').run(sessionId, teamId);

  const nextTeam = getNextAuctionTeam(sessionId, state.current_team_index + 1);
  if (!nextTeam) {
    upsertAuctionState(sessionId, {
      currentTeamIndex: IPL_TEAMS.length,
      activeTeamId: null,
      roundEndsAt: null,
      status: 'completed',
    });
  } else {
    const now = Math.floor(Date.now() / 1000);
    upsertAuctionState(sessionId, {
      currentTeamIndex: nextTeam.teamIndex,
      activeTeamId: nextTeam.teamId,
      roundEndsAt: now + AUCTION_ROUND_SECONDS,
      status: 'running',
    });
  }

  return {
    teamId,
    winnerUserId: winnerBid?.user_id || null,
    amount: winnerBid?.amount || null,
  };
}

// Runs inside a transaction so a round is resolved (credits, ownership, next round) all-or-nothing.
const syncAuctionState = db.transaction(function syncAuctionStateTx(sessionId) {
  if (getPendingBidTeam(sessionId)) return;

  startAuctionIfReady(sessionId);

  let auction = getAuctionState(sessionId);
  let guard = 0;
  const now = Math.floor(Date.now() / 1000);

  while (auction && auction.status === 'running' && auction.round_ends_at && auction.round_ends_at <= now && guard < IPL_TEAMS.length) {
    resolveActiveAuctionRound(sessionId);
    auction = getAuctionState(sessionId);
    guard += 1;
  }
});

// Helper: get full session state
function getSessionState(sessionId, userId) {
  const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  const players = db.prepare(`
    SELECT u.id, u.username, COALESCE(sp.credits, ?) as credits, u.points, u.wins, u.losses, u.draws, u.matches_played
    FROM session_players sp JOIN users u ON sp.user_id = u.id
    WHERE sp.session_id = ?
  `).all(STARTING_CREDITS, sessionId);

  const ownerships = db.prepare('SELECT * FROM team_ownerships WHERE session_id = ?').all(sessionId);
  const homeSelections = db.prepare('SELECT * FROM home_team_selections WHERE session_id = ?').all(sessionId);
  const processedMatches = db.prepare('SELECT match_id FROM match_results WHERE session_id = ?').all(sessionId).map(r => r.match_id);

  const playersWithTeams = players.map(p => ({
    ...(() => {
      const playerTeams = ownerships.filter(o => o.user_id === p.id).map(o => ({ teamId: o.team_id, pricePaid: o.price_paid, isHome: !!o.is_home_team }));
      const ownedHomeTeam = playerTeams.find(t => t.isHome)?.teamId || null;
      return {
        teams: playerTeams,
        homeTeam: ownedHomeTeam || homeSelections.find(h => h.user_id === p.id)?.team_id || null,
      };
    })(),
    ...p,
  }));

  const pendingBidTeam = getPendingBidTeam(sessionId);
  const auction = getAuctionState(sessionId);

  return {
    session: { id: session.id, status: session.status, inviteCode: session.invite_code },
    players: playersWithTeams,
    processedMatchIds: processedMatches,
    pendingBid: pendingBidTeam,
    auction: auction ? {
      status: auction.status,
      activeTeamId: auction.active_team_id,
      roundEndsAt: auction.round_ends_at,
      roundSeconds: AUCTION_ROUND_SECONDS,
      currentTeamIndex: auction.current_team_index,
    } : null,
  };
}

// winnerTeamId / isDraw must come from getTrustedSchedule(), never from a request.
// Wrapped in a transaction: points, stats and the result row commit together or not at all.
const applyMatchResultToSession = db.transaction(function applyMatchResultTx({ sessionId, match, winnerTeamId, isDraw, actorUserId, strictChoice = true }) {
  const sessionRow = db.prepare('SELECT status FROM game_sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return { ok: false, code: 'session-not-found', error: 'Session not found' };
  if (sessionRow.status !== 'active') return { ok: false, code: 'not-active', error: 'Season has not started for this session' };

  const already = db.prepare('SELECT id FROM match_results WHERE session_id = ? AND match_id = ?').get(sessionId, match.id);
  if (already) return { ok: false, code: 'already-processed', error: 'Match already processed' };

  if (!isDraw && winnerTeamId !== match.team1 && winnerTeamId !== match.team2) {
    return { ok: false, code: 'invalid-winner', error: 'Invalid winner team for this match' };
  }

  const state = getSessionState(sessionId, actorUserId);
  if (!state) return { ok: false, code: 'session-not-found', error: 'Session not found' };

  const allOwnedTeams = state.players.flatMap(p => p.teams.map(t => ({ teamId: t.teamId, userId: p.id })));
  const t1Owner = allOwnedTeams.find(o => o.teamId === match.team1);
  const t2Owner = allOwnedTeams.find(o => o.teamId === match.team2);

  if (!t1Owner || !t2Owner) {
    return { ok: false, code: 'owners-missing', error: 'Both teams must be owned by players' };
  }

  const bothSameUser = t1Owner.userId === t2Owner.userId;
  const matchChoice = bothSameUser
    ? db.prepare('SELECT * FROM match_choices WHERE session_id = ? AND match_id = ?').get(sessionId, match.id)
    : null;

  if (bothSameUser && strictChoice && !matchChoice) {
    return { ok: false, code: 'choice-required', error: 'Choose a team first' };
  }

  // Auto-processing skips same-user contests until a choice is made.
  if (bothSameUser && !matchChoice) {
    return { ok: false, code: 'skipped-choice-missing', error: 'Waiting for team choice' };
  }

  let winnerId;
  let loserId;
  let winnerTeam;
  let loserTeam;
  let pointsW;
  let pointsL;

  if (bothSameUser) {
    const chosenTeamId = matchChoice.chosen_team_id;
    const chosenUserId = matchChoice.chosen_user_id;
    const opponentUserId = matchChoice.opponent_user_id;
    const effectiveWinnerTeam = isDraw ? match.team1 : winnerTeamId;
    const loserTeamId = effectiveWinnerTeam === match.team1 ? match.team2 : match.team1;
    const actualWinnerUserId = isDraw
      ? chosenUserId
      : (effectiveWinnerTeam === chosenTeamId ? chosenUserId : opponentUserId);
    const actualLoserUserId = isDraw
      ? opponentUserId
      : (actualWinnerUserId === chosenUserId ? opponentUserId : chosenUserId);

    winnerId = actualWinnerUserId;
    loserId = actualLoserUserId;
    winnerTeam = effectiveWinnerTeam;
    loserTeam = loserTeamId;

    if (isDraw) {
      pointsW = 1;
      pointsL = 1;
      db.prepare('UPDATE users SET points = points + 1, draws = draws + 1, matches_played = matches_played + 1 WHERE id = ?').run(chosenUserId);
      db.prepare('UPDATE users SET points = points + 1, draws = draws + 1, matches_played = matches_played + 1 WHERE id = ?').run(opponentUserId);
    } else {
      pointsW = 2;
      pointsL = 0;
      db.prepare('UPDATE users SET points = points + 2, wins = wins + 1, matches_played = matches_played + 1 WHERE id = ?').run(actualWinnerUserId);
      db.prepare('UPDATE users SET losses = losses + 1, matches_played = matches_played + 1 WHERE id = ?').run(actualLoserUserId);
    }
  } else if (isDraw) {
    pointsW = 1;
    pointsL = 1;
    winnerId = t1Owner.userId;
    loserId = t2Owner.userId;
    winnerTeam = match.team1;
    loserTeam = match.team2;
    db.prepare('UPDATE users SET points = points + 1, draws = draws + 1, matches_played = matches_played + 1 WHERE id = ?').run(t1Owner.userId);
    db.prepare('UPDATE users SET points = points + 1, draws = draws + 1, matches_played = matches_played + 1 WHERE id = ?').run(t2Owner.userId);
  } else {
    const loserTeamId = winnerTeamId === match.team1 ? match.team2 : match.team1;
    winnerId = allOwnedTeams.find(o => o.teamId === winnerTeamId)?.userId;
    loserId = allOwnedTeams.find(o => o.teamId === loserTeamId)?.userId;
    winnerTeam = winnerTeamId;
    loserTeam = loserTeamId;
    pointsW = 2;
    pointsL = 0;
    db.prepare('UPDATE users SET points = points + 2, wins = wins + 1, matches_played = matches_played + 1 WHERE id = ?').run(winnerId);
    db.prepare('UPDATE users SET losses = losses + 1, matches_played = matches_played + 1 WHERE id = ?').run(loserId);
  }

  db.prepare(`
    INSERT INTO match_results (id, session_id, match_id, winner_team, loser_team, winner_user_id, loser_user_id, points_to_winner, points_to_loser, is_draw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), sessionId, match.id, winnerTeam, loserTeam, winnerId, loserId, pointsW, pointsL, isDraw ? 1 : 0);

  return { ok: true, isDraw, matchId: match.id, winnerUserId: isDraw ? null : winnerId, winnerTeam, pointsW };
});

function extractOutcome(match) {
  const source = match.suggestedResult || match.result || null;
  if (!source) return null;
  if (source.isDraw) return { winnerTeamId: null, isDraw: true };
  if (source.winner) return { winnerTeamId: source.winner, isDraw: false };
  return null;
}

const autoApplyFinishedMatches = db.transaction(function autoApplyTx({ sessionId, effectiveSchedule, actorUserId }) {
  const applied = [];

  for (const match of effectiveSchedule) {
    const outcome = extractOutcome(match);
    if (!outcome) continue;

    const result = applyMatchResultToSession({
      sessionId,
      match,
      winnerTeamId: outcome.winnerTeamId,
      isDraw: outcome.isDraw,
      actorUserId,
      strictChoice: false,
    });

    if (result.ok) applied.push(result);
  }

  return applied;
});

const seedTeamsForTesting = db.transaction(function seedTeamsForTestingTx(sessionId) {
  const state = getSessionState(sessionId, null);
  if (!state) return { ok: false, error: 'Session not found' };

  const players = db.prepare('SELECT user_id FROM session_players WHERE session_id = ? ORDER BY joined_at ASC').all(sessionId).map((row) => row.user_id);
  if (players.length < 2) return { ok: false, error: 'Need two players in the session' };

  const [playerA, playerB] = players;

  db.prepare('DELETE FROM bids WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM home_team_selections WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM team_ownerships WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM auction_state WHERE session_id = ?').run(sessionId);

  IPL_TEAMS.forEach((team, index) => {
    const ownerId = index % 2 === 0 ? playerA : playerB;
    const isHomeTeam = index === 0 || index === 1;
    db.prepare('INSERT INTO team_ownerships (id, session_id, user_id, team_id, price_paid, is_home_team) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), sessionId, ownerId, team.id, team.basePrice || 0, isHomeTeam ? 1 : 0);
  });

  db.prepare("UPDATE game_sessions SET status = 'active' WHERE id = ?").run(sessionId);
  db.prepare('UPDATE session_players SET credits = ? WHERE session_id = ?').run(STARTING_CREDITS, sessionId);

  return { ok: true };
});

const ACTIVE_SESSION_SQL = `
  SELECT gs.* FROM game_sessions gs
  JOIN session_players sp ON gs.id = sp.session_id
  WHERE sp.user_id = ? AND gs.status != 'finished'
  ORDER BY
    CASE gs.status
      WHEN 'active' THEN 0
      WHEN 'auction' THEN 1
      ELSE 2
    END ASC,
    (SELECT COUNT(*) FROM session_players sp2 WHERE sp2.session_id = gs.id) DESC,
    gs.created_at DESC
  LIMIT 1
`;

function newInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) code += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM game_sessions WHERE invite_code = ?').get(code)) return code;
  }
  throw new Error('Could not allocate a unique invite code');
}

const createSessionTx = db.transaction((userId) => {
  const existingSession = db.prepare(ACTIVE_SESSION_SQL).get(userId);
  if (existingSession) return existingSession.id;

  const id = uuidv4();
  db.prepare('INSERT INTO game_sessions (id, status, invite_code, creator_id) VALUES (?, ?, ?, ?)').run(id, 'waiting', newInviteCode(), userId);
  db.prepare('INSERT INTO session_players (session_id, user_id, credits) VALUES (?, ?, ?)').run(id, userId, STARTING_CREDITS);
  upsertAuctionState(id, { currentTeamIndex: 0, activeTeamId: null, roundEndsAt: null, status: 'pending' });
  return id;
});

// POST /api/game/session - create session
router.post('/session', authMiddleware, allowFields([]), (req, res) => {
  try {
    const sessionId = createSessionTx(req.user.id);
    res.json({ session: getSessionState(sessionId, req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const joinSessionTx = db.transaction((inviteCode, userId) => {
  const session = db.prepare("SELECT * FROM game_sessions WHERE invite_code = ? AND status = 'waiting'").get(inviteCode);
  if (!session) return { status: 404, error: 'Session not found or already full' };

  const alreadyIn = db.prepare('SELECT 1 FROM session_players WHERE session_id = ? AND user_id = ?').get(session.id, userId);
  if (alreadyIn) return { sessionId: session.id };

  const playerCount = db.prepare('SELECT COUNT(*) as c FROM session_players WHERE session_id = ?').get(session.id).c;
  if (playerCount >= 2) return { status: 400, error: 'Session already has 2 players' };

  db.prepare('INSERT INTO session_players (session_id, user_id, credits) VALUES (?, ?, ?)').run(session.id, userId, STARTING_CREDITS);
  db.prepare("UPDATE game_sessions SET status = 'auction' WHERE id = ? AND status = 'waiting'").run(session.id);
  upsertAuctionState(session.id, { currentTeamIndex: 0, activeTeamId: null, roundEndsAt: null, status: 'pending' });
  syncAuctionState(session.id);
  return { sessionId: session.id, joined: true };
});

// POST /api/game/session/join - join via invite code
router.post('/session/join', authMiddleware, allowFields(['inviteCode']), (req, res) => {
  try {
    const raw = req.body.inviteCode;
    const inviteCode = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!INVITE_CODE_RE.test(inviteCode)) return res.status(400).json({ error: 'Invalid invite code' });

    const result = joinSessionTx(inviteCode, req.user.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.joined) broadcast(req, result.sessionId, 'state-update', { event: 'player-joined-session' });
    res.json({ session: getSessionState(result.sessionId, req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/game/session - get current session
router.get('/session', authMiddleware, (req, res) => {
  try {
    const sessionRow = db.prepare(ACTIVE_SESSION_SQL).get(req.user.id);
    if (!sessionRow) return res.json({ session: null });
    syncAuctionState(sessionRow.id);
    res.json({ session: getSessionState(sessionRow.id, req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const leaveSessionTx = db.transaction((userId) => {
  const sessionRow = db.prepare(ACTIVE_SESSION_SQL).get(userId);
  if (!sessionRow) return null;
  db.prepare("UPDATE game_sessions SET status = 'finished' WHERE id = ?").run(sessionRow.id);
  db.prepare('DELETE FROM bids WHERE session_id = ?').run(sessionRow.id);
  db.prepare('DELETE FROM home_team_selections WHERE session_id = ?').run(sessionRow.id);
  db.prepare('DELETE FROM auction_state WHERE session_id = ?').run(sessionRow.id);
  return sessionRow.id;
});

// POST /api/game/session/leave - leave current ongoing session
router.post('/session/leave', authMiddleware, allowFields([]), (req, res) => {
  try {
    const sessionId = leaveSessionTx(req.user.id);
    if (!sessionId) return res.json({ left: false, session: null });

    broadcast(req, sessionId, 'state-update', { event: 'session-ended' });
    req.app.get('io')?.in(`session:${sessionId}`).socketsLeave(`session:${sessionId}`);
    res.json({ left: true, session: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const selectHomeTeamTx = db.transaction((sessionId, userId, teamId) => {
  const state = getSessionState(sessionId, userId);
  const myPlayer = state.players.find(p => p.id === userId);
  if (!myPlayer) return { status: 403, error: 'Not in this session' };
  if (myPlayer.homeTeam) return { status: 400, error: 'You already selected a home team' };

  const alreadyOwned = state.players.some(p => p.teams.some(t => t.teamId === teamId));
  if (alreadyOwned) return { status: 400, error: 'Team already owned' };
  if (myPlayer.teams.length >= MAX_TEAMS) return { status: 400, error: 'Squad full' };

  db.prepare('INSERT OR REPLACE INTO home_team_selections (session_id, user_id, team_id) VALUES (?, ?, ?)').run(sessionId, userId, teamId);

  const otherPlayer = state.players.find(p => p.id !== userId);
  const otherSelection = otherPlayer
    ? db.prepare('SELECT * FROM home_team_selections WHERE session_id = ? AND user_id = ?').get(sessionId, otherPlayer.id)
    : null;

  let conflict = false;
  if (otherSelection && otherSelection.team_id === teamId) {
    conflict = true; // Both want the same team: bidding war, don't auto-assign.
  } else {
    db.prepare('INSERT INTO team_ownerships (id, session_id, user_id, team_id, price_paid, is_home_team) VALUES (?, ?, ?, ?, 0, 1)').run(uuidv4(), sessionId, userId, teamId);
  }

  syncAuctionState(sessionId);
  return { conflict };
});

// POST /api/game/home-team - select home team (free)
router.post('/home-team', authMiddleware, requireSessionMember({ allowedStatuses: ['waiting', 'auction'] }), allowFields(['sessionId', 'teamId']), (req, res) => {
  try {
    const { sessionId, teamId } = req.body;
    if (!isTeamId(teamId)) return res.status(400).json({ error: 'Invalid teamId' });

    const result = selectHomeTeamTx(sessionId, req.user.id, teamId);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { username } = req.user;
    broadcast(req, sessionId, 'auction-update', {
      type: result.conflict ? 'bid-war-started' : 'home-team-selected',
      teamId, userId: req.user.id, username,
      message: result.conflict
        ? `⚔️ Both players want ${teamShort(teamId)}! Bidding war begins!`
        : `${username} selected ${teamShort(teamId)} as home team (FREE)`,
    });
    res.json({ session: getSessionState(sessionId, req.user.id), conflict: result.conflict });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const placeBidTx = db.transaction((sessionId, userId, teamId, amount) => {
  const playerBalance = db.prepare('SELECT credits FROM session_players WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
  if (!playerBalance) return { status: 403, error: 'Not in this session' };
  if (playerBalance.credits < amount) return { status: 400, error: 'Insufficient cr' };

  const state = getSessionState(sessionId, userId);
  const pendingHomeBid = getPendingBidTeam(sessionId);
  if (pendingHomeBid) {
    if (teamId !== pendingHomeBid) return { status: 400, error: 'Home-team bid is active for a different team' };

    db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ? AND user_id = ?').run(sessionId, teamId, userId);
    db.prepare('INSERT INTO bids (id, session_id, team_id, user_id, amount) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), sessionId, teamId, userId, amount);

    const allBids = db.prepare('SELECT * FROM bids WHERE session_id = ? AND team_id = ? ORDER BY amount DESC, created_at ASC').all(sessionId, teamId);
    let resolved = null;
    if (allBids.length >= state.players.length) {
      if (allBids[0].amount === allBids[1].amount) {
        resolved = { tie: true };
      } else {
        const winner = allBids[0];
        db.prepare('UPDATE session_players SET credits = credits - ? WHERE session_id = ? AND user_id = ?').run(winner.amount, sessionId, winner.user_id);
        db.prepare('INSERT INTO team_ownerships (id, session_id, user_id, team_id, price_paid, is_home_team) VALUES (?, ?, ?, ?, ?, 1)').run(uuidv4(), sessionId, winner.user_id, teamId, winner.amount);
        db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ?').run(sessionId, teamId);
        db.prepare('DELETE FROM home_team_selections WHERE session_id = ?').run(sessionId);
        resolved = { winnerId: winner.user_id, winnerName: usernameOf(winner.user_id), amount: winner.amount };
      }
    }
    syncAuctionState(sessionId);
    return { body: { resolved } };
  }

  if (!bothPlayersHaveHomeTeams(sessionId)) {
    return { status: 400, error: 'Both players must choose home teams before auction starts' };
  }

  syncAuctionState(sessionId);
  const auction = getAuctionState(sessionId);
  if (!auction || auction.status !== 'running' || !auction.active_team_id) {
    return { status: 400, error: 'No active auction round', includeSession: true };
  }
  if (teamId !== auction.active_team_id) {
    return { status: 400, error: 'This team is not active for bidding right now' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (auction.round_ends_at && now >= auction.round_ends_at) {
    return { status: 400, error: 'Round ended. Next team is active now.', includeSession: true };
  }
  if (teamCount(sessionId, userId) >= MAX_TEAMS) {
    return { status: 400, error: `Squad full (max ${MAX_TEAMS} teams)` };
  }

  db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ? AND user_id = ?').run(sessionId, teamId, userId);
  db.prepare('INSERT INTO bids (id, session_id, team_id, user_id, amount) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), sessionId, teamId, userId, amount);
  return { body: { accepted: true, roundEndsAt: auction.round_ends_at } };
});

// POST /api/game/bid - place a bid (home-team conflict or active auction round)
router.post('/bid', authMiddleware, requireSessionMember({ allowedStatuses: ['auction'] }), allowFields(['sessionId', 'teamId', 'amount']), (req, res) => {
  try {
    const { sessionId, teamId, amount } = req.body;
    if (!isTeamId(teamId)) return res.status(400).json({ error: 'Invalid teamId' });
    if (!Number.isInteger(amount) || amount < 1 || amount > STARTING_CREDITS) {
      return res.status(400).json({ error: `Bid must be a whole number between 1 and ${STARTING_CREDITS} cr` });
    }

    const result = placeBidTx(sessionId, req.user.id, teamId, amount);
    if (result.error) {
      const body = { error: result.error };
      if (result.includeSession) body.session = getSessionState(sessionId, req.user.id);
      return res.status(result.status).json(body);
    }

    const { username } = req.user;
    const resolved = result.body.resolved;
    broadcast(req, sessionId, 'auction-update', resolved?.winnerName
      ? { type: 'bid-war-resolved', teamId, userId: resolved.winnerId, username: resolved.winnerName,
          message: `${resolved.winnerName} won ${teamShort(teamId)} for ${resolved.amount} cr!` }
      : { type: 'bid-placed', teamId, userId: req.user.id, username,
          message: `${username} placed a bid on ${teamShort(teamId)}` });

    res.json({ session: getSessionState(sessionId, req.user.id), ...result.body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/buy-team - buy a team outright
router.post('/buy-team', authMiddleware, (req, res) => {
  res.status(400).json({ error: 'Direct buy is disabled. Use the active 20-second bid round.' });
});

const finalizeAuctionTx = db.transaction((sessionId) => {
  syncAuctionState(sessionId);
  const auction = getAuctionState(sessionId);
  if (!auction || auction.status !== 'completed') {
    return { status: 400, error: 'Auction is still running. Complete all team rounds first.' };
  }
  const changed = db.prepare("UPDATE game_sessions SET status = 'active', started_at = strftime('%s','now') WHERE id = ? AND status = 'auction'").run(sessionId).changes;
  if (!changed) return { status: 409, error: 'Season already started' };
  return {};
});

// POST /api/game/finalize-auction
router.post('/finalize-auction', authMiddleware, requireSessionMember({ allowedStatuses: ['auction'] }), allowFields(['sessionId']), (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = finalizeAuctionTx(sessionId);
    if (result.error) return res.status(result.status).json({ error: result.error });
    broadcast(req, sessionId, 'state-update', { event: 'season-started' });
    res.json({ session: getSessionState(sessionId, req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function requireTestHelper(req, res, next) {
  if (!ALLOW_TEST_HELPER) return res.status(403).json({ error: 'Test helper disabled' });
  next();
}

// POST /api/game/debug/seed-session - test-only helper to skip bidding and jump to active play
router.post('/debug/seed-session', authMiddleware, requireTestHelper, requireSessionMember(), allowFields(['sessionId']), (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = seedTeamsForTesting(sessionId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    broadcast(req, sessionId, 'state-update', { event: 'session-seeded' });
    return res.json({ session: getSessionState(sessionId, req.user.id), seeded: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function announceAppliedResults(req, sessionId, applied) {
  for (const r of applied) {
    const message = r.isDraw
      ? `🤝 Match ${r.matchId} drawn: both players earn 1 point`
      : `🏆 ${usernameOf(r.winnerUserId)} earns ${r.pointsW} points (${teamShort(r.winnerTeam)} won)`;
    broadcast(req, sessionId, 'match-result', {
      matchId: r.matchId,
      winnerName: r.isDraw ? null : usernameOf(r.winnerUserId),
      points: r.isDraw ? 1 : r.pointsW,
      message,
    });
  }
}

// GET /api/game/matches/:sessionId
router.get('/matches/:sessionId', authMiddleware, requireSessionMember({ from: 'params' }), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const effectiveSchedule = await getTrustedSchedule();

    // Results are applied only once the season is active, and only from trusted sources.
    let applied = [];
    if (req.gameSession.status === 'active') {
      applied = autoApplyFinishedMatches({ sessionId, effectiveSchedule, actorUserId: req.user.id });
      announceAppliedResults(req, sessionId, applied);
    }

    const state = getSessionState(sessionId, req.user.id);
    if (!state) return res.status(404).json({ error: 'Session not found' });

    const matchResultsDb = db.prepare('SELECT * FROM match_results WHERE session_id = ?').all(sessionId);
    const resultByMatchId = new Map(matchResultsDb.map(r => [r.match_id, r]));
    const matchChoicesDb = db.prepare('SELECT * FROM match_choices WHERE session_id = ?').all(sessionId);
    const choiceByMatchId = new Map(matchChoicesDb.map(r => [r.match_id, r]));
    const allOwnedTeams = state.players.flatMap(p => p.teams.map(t => ({ teamId: t.teamId, userId: p.id, username: p.username })));

    const enrichedMatches = effectiveSchedule.map((m) => {
      const t1Owner = allOwnedTeams.find(o => o.teamId === m.team1);
      const t2Owner = allOwnedTeams.find(o => o.teamId === m.team2);
      const processedResult = resultByMatchId.get(m.id) || null;
      const choice = choiceByMatchId.get(m.id) || null;

      return {
        ...m,
        result: processedResult ? { winner: processedResult.winner_team, isDraw: !!processedResult.is_draw } : null,
        suggestedResult: !processedResult ? (m.suggestedResult || m.result || null) : null,
        team1Owner: t1Owner || null,
        team2Owner: t2Owner || null,
        isContest: t1Owner && t2Owner && t1Owner.userId !== t2Owner.userId,
        bothSameUser: t1Owner && t2Owner && t1Owner.userId === t2Owner.userId,
        matchChoice: choice ? {
          chosenTeamId: choice.chosen_team_id,
          chosenUserId: choice.chosen_user_id,
          opponentUserId: choice.opponent_user_id,
        } : null,
        processed: !!processedResult,
      };
    });

    res.json({ matches: enrichedMatches, results: matchResultsDb });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const matchChoiceTx = db.transaction((sessionId, userId, match, chosenTeamId) => {
  const state = getSessionState(sessionId, userId);
  if (db.prepare('SELECT 1 FROM match_results WHERE session_id = ? AND match_id = ?').get(sessionId, match.id)) {
    return { status: 409, error: 'Match already processed' };
  }

  const allOwnedTeams = state.players.flatMap(p => p.teams.map(t => ({ teamId: t.teamId, userId: p.id })));
  const t1Owner = allOwnedTeams.find(o => o.teamId === match.team1);
  const t2Owner = allOwnedTeams.find(o => o.teamId === match.team2);

  if (!t1Owner || !t2Owner) return { status: 400, error: 'Both teams must be owned before choosing a side' };
  if (t1Owner.userId !== t2Owner.userId) return { status: 400, error: 'This match is already a normal contest' };
  if (t1Owner.userId !== userId) return { status: 403, error: 'Only the team owner can choose a side' };

  const opponent = state.players.find(p => p.id !== userId);
  if (!opponent) return { status: 400, error: 'Opponent player not found' };

  db.prepare(`
    INSERT INTO match_choices (session_id, match_id, chosen_team_id, chosen_user_id, opponent_user_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, match_id) DO UPDATE SET
      chosen_team_id = excluded.chosen_team_id,
      chosen_user_id = excluded.chosen_user_id,
      opponent_user_id = excluded.opponent_user_id,
      updated_at = strftime('%s','now')
  `).run(sessionId, match.id, chosenTeamId, userId, opponent.id);

  return { choice: { matchId: match.id, chosenTeamId, chosenUserId: userId, opponentUserId: opponent.id } };
});

// POST /api/game/match-choice
router.post('/match-choice', authMiddleware, requireSessionMember({ allowedStatuses: ['active'] }), allowFields(['sessionId', 'matchId', 'chosenTeamId']), async (req, res) => {
  try {
    const { sessionId, matchId, chosenTeamId } = req.body;
    if (!isMatchId(matchId)) return res.status(400).json({ error: 'Invalid matchId' });
    if (!isTeamId(chosenTeamId)) return res.status(400).json({ error: 'Invalid team choice' });

    const effectiveSchedule = await getTrustedSchedule();
    const match = effectiveSchedule.find(m => m.id === matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (chosenTeamId !== match.team1 && chosenTeamId !== match.team2) {
      return res.status(400).json({ error: 'Invalid team choice' });
    }
    // Sides lock before the match: otherwise the owner could wait for the result and pick the winner.
    if (extractOutcome(match)) return res.status(409).json({ error: 'Result already known; sides are locked' });
    if (!match.date || match.date <= todayUtc()) {
      return res.status(409).json({ error: 'Sides lock at the start of match day (UTC)' });
    }

    const result = matchChoiceTx(sessionId, req.user.id, match, chosenTeamId);
    if (result.error) return res.status(result.status).json({ error: result.error });

    broadcast(req, sessionId, 'state-update', { event: 'match-choice', matchId });
    res.json({ session: getSessionState(sessionId, req.user.id), choice: result.choice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/process-match - apply the OFFICIAL result of a match to this session.
// The winner is never taken from the request; it comes from getTrustedSchedule().
router.post('/process-match', authMiddleware, requireSessionMember({ allowedStatuses: ['active'] }), allowFields(['sessionId', 'matchId']), async (req, res) => {
  try {
    const { sessionId, matchId } = req.body;
    if (!isMatchId(matchId)) return res.status(400).json({ error: 'Invalid matchId' });

    const effectiveSchedule = await getTrustedSchedule();
    const match = effectiveSchedule.find(m => m.id === matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const outcome = extractOutcome(match);
    if (!outcome) return res.status(409).json({ error: 'No official result for this match yet' });

    const result = applyMatchResultToSession({
      sessionId,
      match,
      winnerTeamId: outcome.winnerTeamId,
      isDraw: outcome.isDraw,
      actorUserId: req.user.id,
      strictChoice: true,
    });

    if (!result.ok) {
      if (result.code === 'session-not-found') return res.status(404).json({ error: result.error });
      if (result.code === 'already-processed' || result.code === 'not-active') return res.status(409).json({ error: result.error });
      return res.status(400).json({ error: result.error });
    }

    announceAppliedResults(req, sessionId, [result]);
    res.json({
      session: getSessionState(sessionId, req.user.id),
      message: outcome.isDraw ? 'Draw! Both players get 1 point.' : 'Match processed! Winner gets 2 points.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/game/admin/matches - read-only overview for the admin page. No session needed:
// official results are global, so the admin does not have to be playing a game.
router.get('/admin/matches', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const today = todayUtc();
    const trusted = await getTrustedSchedule();
    const entered = new Map(db.prepare(`
      SELECT o.match_id, o.set_at, u.username AS set_by_name
      FROM official_results o LEFT JOIN users u ON u.id = o.set_by
    `).all().map(r => [r.match_id, r]));

    const matches = trusted.map((m) => {
      const outcome = extractOutcome(m);
      let source = null;
      if (outcome) {
        if (m.result?.method === 'admin') source = 'admin';
        else if (m.result) source = 'schedule';
        else source = 'live-feed';
      }
      const status = outcome ? 'decided' : (m.date && m.date <= today ? 'needs-result' : 'upcoming');
      const adminEntry = source === 'admin' ? entered.get(m.id) : null;
      return {
        id: m.id,
        team1: m.team1,
        team2: m.team2,
        date: m.date,
        venue: m.venue,
        status,
        outcome,
        source,
        liveStatus: m.liveStatus || null,
        enteredBy: adminEntry?.set_by_name || null,
        enteredAt: adminEntry?.set_at || null,
      };
    });

    res.json({ today, matches, live: getLiveDiagnostics() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/admin/match-result - admin enters an official result when no trusted source has one.
// Role is checked server-side from the DB (requireAdmin). Existing results cannot be overwritten.
router.post('/admin/match-result', authMiddleware, requireAdmin, allowFields(['matchId', 'winnerTeamId', 'isDraw']), async (req, res) => {
  try {
    const { matchId, winnerTeamId, isDraw } = req.body;
    if (!isMatchId(matchId)) return res.status(400).json({ error: 'Invalid matchId' });
    if (isDraw !== undefined && typeof isDraw !== 'boolean') return res.status(400).json({ error: 'isDraw must be a boolean' });
    const draw = isDraw === true;
    if (draw && winnerTeamId != null) return res.status(400).json({ error: 'A draw has no winner' });

    const effectiveSchedule = await getTrustedSchedule();
    const match = effectiveSchedule.find(m => m.id === matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!draw && winnerTeamId !== match.team1 && winnerTeamId !== match.team2) {
      return res.status(400).json({ error: 'Winner must be one of the two teams in this match' });
    }
    if (!match.date || match.date > todayUtc()) return res.status(409).json({ error: 'Match has not been played yet' });
    if (extractOutcome(match)) return res.status(409).json({ error: 'An official result already exists for this match' });

    const inserted = db.prepare(`
      INSERT INTO official_results (match_id, winner_team, is_draw, set_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(match_id) DO NOTHING
    `).run(matchId, draw ? null : winnerTeamId, draw ? 1 : 0, req.user.id).changes;
    if (!inserted) return res.status(409).json({ error: 'An official result already exists for this match' });

    console.log(`[admin] ${req.user.username} set result for ${matchId}: ${draw ? 'draw' : winnerTeamId}`);
    // Sessions apply it on their next /matches fetch (the Matches page polls every 5s).
    res.json({ ok: true, matchId, result: draw ? { isDraw: true } : { winner: winnerTeamId } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/game/leaderboard
router.get('/leaderboard', authMiddleware, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, points, wins, losses, draws, matches_played, credits FROM users ORDER BY points DESC, wins DESC').all();
    res.json({ leaderboard: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/game/ipl-data
router.get('/ipl-data', (req, res) => {
  res.json({ teams: IPL_TEAMS, matches: MATCH_SCHEDULE });
});

// GET /api/game/live-status
router.get('/live-status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await getEffectiveSchedule();
    const diagnostics = getLiveDiagnostics();
    res.json({
      live: diagnostics,
      nowTs: Date.now(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
