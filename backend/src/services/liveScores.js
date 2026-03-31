const { MATCH_SCHEDULE } = require('../db/iplData');

const CACHE_MS = 60 * 1000;

const TEAM_ALIASES = {
  csk: ['csk', 'chennai super kings', 'chennai'],
  mi: ['mi', 'mumbai indians', 'mumbai'],
  rcb: ['rcb', 'royal challengers bengaluru', 'royal challengers bangalore', 'bengaluru', 'bangalore'],
  kkr: ['kkr', 'kolkata knight riders', 'kolkata'],
  dc: ['dc', 'delhi capitals', 'delhi'],
  srh: ['srh', 'sunrisers hyderabad', 'hyderabad'],
  rr: ['rr', 'rajasthan royals', 'rajasthan'],
  pbks: ['pbks', 'punjab kings', 'kings xi punjab', 'punjab'],
  gt: ['gt', 'gujarat titans', 'gujarat'],
  lsg: ['lsg', 'lucknow super giants', 'lucknow'],
};

const aliasToTeamId = Object.entries(TEAM_ALIASES).reduce((acc, [teamId, aliases]) => {
  aliases.forEach((name) => {
    acc[normalize(name)] = teamId;
  });
  return acc;
}, {});

let cache = {
  ts: 0,
  matches: [],
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveTeamId(teamName) {
  const key = normalize(teamName);
  return aliasToTeamId[key] || null;
}

function toIsoDate(input) {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function sameFixture(a, b) {
  const sameTeams =
    (a.team1 === b.team1 && a.team2 === b.team2) ||
    (a.team1 === b.team2 && a.team2 === b.team1);

  if (!sameTeams) return false;
  if (!a.date || !b.date) return true;
  return a.date === b.date;
}

function parseWinner(match) {
  const winnerName = match.matchWinner || match.winnerTeam || '';
  if (!winnerName) return null;
  return resolveTeamId(winnerName);
}

async function fetchCricApiMatches() {
  const key = process.env.CRICAPI_KEY;
  if (!key) return [];

  const url = `https://api.cricapi.com/v1/currentMatches?apikey=${encodeURIComponent(key)}&offset=0`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CricAPI request failed: ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  const seriesFilter = normalize(process.env.LIVE_SERIES_FILTER || 'ipl');

  const liveMatches = rows
    .filter((m) => {
      if (!seriesFilter) return true;
      const haystack = normalize(`${m.name || ''} ${m.series || ''}`);
      return haystack.includes(seriesFilter);
    })
    .map((m) => {
      const teamNames = Array.isArray(m.teamInfo)
        ? m.teamInfo.map((t) => t?.name).filter(Boolean)
        : Array.isArray(m.teams)
        ? m.teams
        : [];

      if (teamNames.length < 2) return null;

      const team1 = resolveTeamId(teamNames[0]);
      const team2 = resolveTeamId(teamNames[1]);
      if (!team1 || !team2 || team1 === team2) return null;

      const winner = parseWinner(m);
      const date = toIsoDate(m.dateTimeGMT || m.date || m.matchStarted);

      return {
        id: `cricapi:${m.id || `${team1}-${team2}-${date || 'na'}`}`,
        team1,
        team2,
        date,
        venue: m.venue || 'TBD',
        liveStatus: m.status || 'Live',
        result: winner ? { winner, method: 'live-api' } : null,
        source: 'cricapi',
      };
    })
    .filter(Boolean);

  return liveMatches;
}

async function getLiveMatches() {
  const provider = (process.env.LIVE_MATCH_PROVIDER || '').trim().toLowerCase();
  if (!provider) return [];

  const now = Date.now();
  if (now - cache.ts < CACHE_MS) return cache.matches;

  try {
    const matches = provider === 'cricapi' ? await fetchCricApiMatches() : [];
    cache = { ts: now, matches };
    return matches;
  } catch (err) {
    console.error('[LiveScores] Failed to fetch live matches:', err.message);
    return cache.matches;
  }
}

async function getEffectiveSchedule() {
  const liveMatches = await getLiveMatches();
  const staticMatches = MATCH_SCHEDULE.map((m) => ({ ...m }));

  const consumedLiveIds = new Set();

  const mergedStatic = staticMatches.map((match) => {
    const live = liveMatches.find((l) => sameFixture(match, l));
    if (!live) {
      return {
        ...match,
        liveStatus: null,
        source: 'static',
      };
    }

    consumedLiveIds.add(live.id);

    return {
      ...match,
      // Keep static schedule as source of truth for fixtures, but expose live result suggestion.
      suggestedResult: live.result || null,
      liveStatus: live.liveStatus,
      source: live.source,
    };
  });

  const extraLive = liveMatches
    .filter((m) => !consumedLiveIds.has(m.id))
    .map((m) => ({
      id: `live_${m.id.replace(/[^a-zA-Z0-9:_-]/g, '_')}`,
      team1: m.team1,
      team2: m.team2,
      date: m.date || new Date().toISOString().slice(0, 10),
      venue: m.venue || 'TBD',
      result: null,
      suggestedResult: m.result || null,
      liveStatus: m.liveStatus || 'Live',
      source: m.source,
      external: true,
    }));

  return [...mergedStatic, ...extraLive].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

module.exports = {
  getEffectiveSchedule,
};
