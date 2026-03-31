const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { IPL_TEAMS, MATCH_SCHEDULE } = require('../db/iplData');
const { getEffectiveSchedule } = require('../services/liveScores');

const router = express.Router();
const MAX_TEAMS = 5;
const STARTING_CREDITS = 100;
const AUCTION_ROUND_SECONDS = 20;

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
      return player && player.credits >= bid.amount;
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

function syncAuctionState(sessionId) {
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
}

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

// POST /api/game/session - create session
router.post('/session', authMiddleware, (req, res) => {
  try {
    const existingSession = db.prepare(`
      SELECT gs.* FROM game_sessions gs
      JOIN session_players sp ON gs.id = sp.session_id
      WHERE sp.user_id = ? AND gs.status != 'finished'
    `).get(req.user.id);

    if (existingSession) {
      const state = getSessionState(existingSession.id, req.user.id);
      return res.json({ session: state });
    }

    const id = uuidv4();
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare('INSERT INTO game_sessions (id, status, invite_code, creator_id) VALUES (?, ?, ?, ?)').run(id, 'waiting', inviteCode, req.user.id);
    db.prepare('INSERT INTO session_players (session_id, user_id, credits) VALUES (?, ?, ?)').run(id, req.user.id, STARTING_CREDITS);
    upsertAuctionState(id, { currentTeamIndex: 0, activeTeamId: null, roundEndsAt: null, status: 'pending' });

    const state = getSessionState(id, req.user.id);
    res.json({ session: state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/session/join - join via invite code
router.post('/session/join', authMiddleware, (req, res) => {
  try {
    const { inviteCode } = req.body;
    const session = db.prepare("SELECT * FROM game_sessions WHERE invite_code = ? AND status = 'waiting'").get(inviteCode);
    if (!session) return res.status(404).json({ error: 'Session not found or already full' });

    const alreadyIn = db.prepare('SELECT * FROM session_players WHERE session_id = ? AND user_id = ?').get(session.id, req.user.id);
    if (alreadyIn) {
      const state = getSessionState(session.id, req.user.id);
      return res.json({ session: state });
    }

    const playerCount = db.prepare('SELECT COUNT(*) as c FROM session_players WHERE session_id = ?').get(session.id).c;
    if (playerCount >= 2) return res.status(400).json({ error: 'Session already has 2 players' });

    db.prepare('INSERT INTO session_players (session_id, user_id, credits) VALUES (?, ?, ?)').run(session.id, req.user.id, STARTING_CREDITS);
    db.prepare("UPDATE game_sessions SET status = 'auction' WHERE id = ?").run(session.id);
    upsertAuctionState(session.id, { currentTeamIndex: 0, activeTeamId: null, roundEndsAt: null, status: 'pending' });
    syncAuctionState(session.id);

    const state = getSessionState(session.id, req.user.id);
    res.json({ session: state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/game/session - get current session
router.get('/session', authMiddleware, (req, res) => {
  try {
    const sessionRow = db.prepare(`
      SELECT gs.* FROM game_sessions gs
      JOIN session_players sp ON gs.id = sp.session_id
      WHERE sp.user_id = ? AND gs.status != 'finished'
      ORDER BY gs.created_at DESC LIMIT 1
    `).get(req.user.id);

    if (!sessionRow) return res.json({ session: null });
  syncAuctionState(sessionRow.id);
    const state = getSessionState(sessionRow.id, req.user.id);
    res.json({ session: state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/session/leave - leave current ongoing session
router.post('/session/leave', authMiddleware, (req, res) => {
  try {
    const sessionRow = db.prepare(`
      SELECT gs.* FROM game_sessions gs
      JOIN session_players sp ON gs.id = sp.session_id
      WHERE sp.user_id = ? AND gs.status != 'finished'
      ORDER BY gs.created_at DESC LIMIT 1
    `).get(req.user.id);

    if (!sessionRow) return res.json({ left: false, session: null });

    db.prepare("UPDATE game_sessions SET status = 'finished' WHERE id = ?").run(sessionRow.id);
    db.prepare('DELETE FROM bids WHERE session_id = ?').run(sessionRow.id);
    db.prepare('DELETE FROM home_team_selections WHERE session_id = ?').run(sessionRow.id);
    db.prepare('DELETE FROM auction_state WHERE session_id = ?').run(sessionRow.id);

    res.json({ left: true, session: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/home-team - select home team (free)
router.post('/home-team', authMiddleware, (req, res) => {
  try {
    const { sessionId, teamId } = req.body;
    const state = getSessionState(sessionId, req.user.id);
    if (!state) return res.status(404).json({ error: 'Session not found' });

    const myPlayer = state.players.find(p => p.id === req.user.id);
    if (!myPlayer) return res.status(403).json({ error: 'Not in this session' });
    if (myPlayer.homeTeam) return res.status(400).json({ error: 'You already selected a home team' });

    // Check not already owned
    const alreadyOwned = state.players.some(p => p.teams.some(t => t.teamId === teamId));
    if (alreadyOwned) return res.status(400).json({ error: 'Team already owned' });

    // Check squad not full
    if (myPlayer.teams.length >= MAX_TEAMS) return res.status(400).json({ error: 'Squad full' });

    // Insert home selection
    db.prepare('INSERT OR REPLACE INTO home_team_selections (session_id, user_id, team_id) VALUES (?, ?, ?)').run(sessionId, req.user.id, teamId);

    // Check if other player also selected
    const otherPlayer = state.players.find(p => p.id !== req.user.id);
    const otherSelection = db.prepare('SELECT * FROM home_team_selections WHERE session_id = ? AND user_id = ?').get(sessionId, otherPlayer?.id);

    let conflict = false;
    if (otherSelection && otherSelection.team_id === teamId) {
      // Both want same team → bidding war, don't auto-assign
      conflict = true;
    } else {
      // No conflict → assign for free
      db.prepare('INSERT INTO team_ownerships (id, session_id, user_id, team_id, price_paid, is_home_team) VALUES (?, ?, ?, ?, 0, 1)').run(uuidv4(), sessionId, req.user.id, teamId);
    }

    syncAuctionState(sessionId);

    const newState = getSessionState(sessionId, req.user.id);
    res.json({ session: newState, conflict });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/bid - place a bid (for home team conflict)
router.post('/bid', authMiddleware, (req, res) => {
  try {
    const { sessionId, teamId, amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Bid must be at least 1 cr' });

    const playerBalance = db.prepare('SELECT credits FROM session_players WHERE session_id = ? AND user_id = ?').get(sessionId, req.user.id);
    if (!playerBalance) return res.status(403).json({ error: 'Not in this session' });
    if (playerBalance.credits < amount) return res.status(400).json({ error: 'Insufficient cr' });

    const state = getSessionState(sessionId, req.user.id);
    if (!state) return res.status(404).json({ error: 'Session not found' });
    if (!state.players.find(p => p.id === req.user.id)) return res.status(403).json({ error: 'Not in this session' });

    const pendingHomeBid = getPendingBidTeam(sessionId);
    if (pendingHomeBid) {
      if (teamId !== pendingHomeBid) return res.status(400).json({ error: 'Home-team bid is active for a different team' });

      db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ? AND user_id = ?').run(sessionId, teamId, req.user.id);
      db.prepare('INSERT INTO bids (id, session_id, team_id, user_id, amount) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), sessionId, teamId, req.user.id, amount);

      const allBids = db.prepare('SELECT * FROM bids WHERE session_id = ? AND team_id = ? ORDER BY amount DESC, created_at ASC').all(sessionId, teamId);
      const playerCount = state.players.length;

      let resolved = null;
      if (allBids.length >= playerCount) {
        if (allBids[0].amount === allBids[1].amount) {
          resolved = { tie: true };
        } else {
          const winner = allBids[0];
          db.prepare('UPDATE session_players SET credits = credits - ? WHERE session_id = ? AND user_id = ?').run(winner.amount, sessionId, winner.user_id);
          db.prepare('INSERT INTO team_ownerships (id, session_id, user_id, team_id, price_paid, is_home_team) VALUES (?, ?, ?, ?, ?, 1)').run(uuidv4(), sessionId, winner.user_id, teamId, winner.amount);
          db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ?').run(sessionId, teamId);
          db.prepare('DELETE FROM home_team_selections WHERE session_id = ?').run(sessionId);

          const winnerUser = db.prepare('SELECT username FROM users WHERE id = ?').get(winner.user_id);
          resolved = { winnerId: winner.user_id, winnerName: winnerUser.username, amount: winner.amount };
        }
      }

      syncAuctionState(sessionId);
      const newState = getSessionState(sessionId, req.user.id);
      return res.json({ session: newState, resolved });
    }

    if (!bothPlayersHaveHomeTeams(sessionId)) {
      return res.status(400).json({ error: 'Both players must choose home teams before auction starts' });
    }

    syncAuctionState(sessionId);
    const auction = getAuctionState(sessionId);
    if (!auction || auction.status !== 'running' || !auction.active_team_id) {
      const latestState = getSessionState(sessionId, req.user.id);
      return res.status(400).json({ error: 'No active auction round', session: latestState });
    }

    if (teamId !== auction.active_team_id) {
      return res.status(400).json({ error: 'This team is not active for bidding right now' });
    }

    const now = Math.floor(Date.now() / 1000);
    if (auction.round_ends_at && now >= auction.round_ends_at) {
      syncAuctionState(sessionId);
      const latestState = getSessionState(sessionId, req.user.id);
      return res.status(400).json({ error: 'Round ended. Next team is active now.', session: latestState });
    }

    db.prepare('DELETE FROM bids WHERE session_id = ? AND team_id = ? AND user_id = ?').run(sessionId, teamId, req.user.id);
    db.prepare('INSERT INTO bids (id, session_id, team_id, user_id, amount) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), sessionId, teamId, req.user.id, amount);

    const newState = getSessionState(sessionId, req.user.id);
    res.json({ session: newState, accepted: true, roundEndsAt: auction.round_ends_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/buy-team - buy a team outright
router.post('/buy-team', authMiddleware, (req, res) => {
  try {
    res.status(400).json({ error: 'Direct buy is disabled. Use the active 20-second bid round.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/finalize-auction
router.post('/finalize-auction', authMiddleware, (req, res) => {
  try {
    const { sessionId } = req.body;
    syncAuctionState(sessionId);
    const auction = getAuctionState(sessionId);
    if (auction && auction.status !== 'completed') {
      return res.status(400).json({ error: 'Auction is still running. Complete all team rounds first.' });
    }
    db.prepare("UPDATE game_sessions SET status = 'active', started_at = strftime('%s','now') WHERE id = ?").run(sessionId);
    const state = getSessionState(sessionId, req.user.id);
    res.json({ session: state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/game/matches/:sessionId
router.get('/matches/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const state = getSessionState(sessionId, req.user.id);
    if (!state) return res.status(404).json({ error: 'Session not found' });

    const effectiveSchedule = await getEffectiveSchedule();

    const matchResultsDb = db.prepare('SELECT * FROM match_results WHERE session_id = ?').all(sessionId);
    const resultByMatchId = new Map(matchResultsDb.map(r => [r.match_id, r]));
    const allOwnedTeams = state.players.flatMap(p => p.teams.map(t => ({ teamId: t.teamId, userId: p.id, username: p.username })));

    const enrichedMatches = effectiveSchedule.map(m => {
      const t1Owner = allOwnedTeams.find(o => o.teamId === m.team1);
      const t2Owner = allOwnedTeams.find(o => o.teamId === m.team2);
      const processedResult = resultByMatchId.get(m.id) || null;
      return {
        ...m,
        result: processedResult ? { winner: processedResult.winner_team, isDraw: !!processedResult.is_draw } : null,
        suggestedResult: !processedResult ? (m.suggestedResult || m.result || null) : null,
        team1Owner: t1Owner || null,
        team2Owner: t2Owner || null,
        isContest: t1Owner && t2Owner && t1Owner.userId !== t2Owner.userId,
        bothSameUser: t1Owner && t2Owner && t1Owner.userId === t2Owner.userId,
        processed: !!processedResult,
      };
    });

    res.json({ matches: enrichedMatches, results: matchResultsDb });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/game/process-match - apply match result and award points
router.post('/process-match', authMiddleware, async (req, res) => {
  try {
    const { sessionId, matchId, winnerTeamId, isDraw } = req.body;

    const already = db.prepare('SELECT id FROM match_results WHERE session_id = ? AND match_id = ?').get(sessionId, matchId);
    if (already) return res.status(400).json({ error: 'Match already processed' });

    const effectiveSchedule = await getEffectiveSchedule();
    const match = effectiveSchedule.find(m => m.id === matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const state = getSessionState(sessionId, req.user.id);
    const allOwnedTeams = state.players.flatMap(p => p.teams.map(t => ({ teamId: t.teamId, userId: p.id })));

    const t1Owner = allOwnedTeams.find(o => o.teamId === match.team1);
    const t2Owner = allOwnedTeams.find(o => o.teamId === match.team2);

    if (!t1Owner || !t2Owner) return res.status(400).json({ error: 'Both teams must be owned by players' });
    if (t1Owner.userId === t2Owner.userId) return res.status(400).json({ error: 'Both teams owned by same player — no contest' });

    let winnerId, loserId, winnerTeam, loserTeam, pointsW, pointsL;
    if (isDraw) {
      pointsW = 1; pointsL = 1;
      winnerId = t1Owner.userId; loserId = t2Owner.userId;
      winnerTeam = match.team1; loserTeam = match.team2;
      db.prepare('UPDATE users SET points = points + 1, draws = draws + 1, matches_played = matches_played + 1 WHERE id = ?').run(t1Owner.userId);
      db.prepare('UPDATE users SET points = points + 1, draws = draws + 1, matches_played = matches_played + 1 WHERE id = ?').run(t2Owner.userId);
    } else {
      const loserTeamId = winnerTeamId === match.team1 ? match.team2 : match.team1;
      winnerId = allOwnedTeams.find(o => o.teamId === winnerTeamId)?.userId;
      loserId = allOwnedTeams.find(o => o.teamId === loserTeamId)?.userId;
      winnerTeam = winnerTeamId; loserTeam = loserTeamId;
      pointsW = 2; pointsL = 0;
      db.prepare('UPDATE users SET points = points + 2, wins = wins + 1, matches_played = matches_played + 1 WHERE id = ?').run(winnerId);
      db.prepare('UPDATE users SET losses = losses + 1, matches_played = matches_played + 1 WHERE id = ?').run(loserId);
    }

    db.prepare(`
      INSERT INTO match_results (id, session_id, match_id, winner_team, loser_team, winner_user_id, loser_user_id, points_to_winner, points_to_loser, is_draw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), sessionId, matchId, winnerTeam, loserTeam, winnerId, loserId, pointsW, pointsL, isDraw ? 1 : 0);

    const newState = getSessionState(sessionId, req.user.id);
    res.json({ session: newState, message: isDraw ? 'Draw! Both players get 1 point.' : 'Match processed! Winner gets 2 points.' });
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

module.exports = router;
