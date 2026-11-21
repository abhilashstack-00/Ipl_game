// Small helpers for reading match data from GET /game/matches/:sessionId.
// The server decides results and points; these only describe them for the UI.

export const todayUtc = () => new Date().toISOString().slice(0, 10)

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// Which player effectively plays each side in this game.
// When one player owns both teams, the owner picks a side and the opponent gets the other.
export function sideOwners(match) {
  const t1 = match.team1Owner?.userId || null
  const t2 = match.team2Owner?.userId || null
  if (t1 && t2 && t1 === t2) {
    const c = match.matchChoice
    if (!c) return { [match.team1]: null, [match.team2]: null, needsChoice: true, owner: t1 }
    const other = c.chosenTeamId === match.team1 ? match.team2 : match.team1
    return { [c.chosenTeamId]: c.chosenUserId, [other]: c.opponentUserId, needsChoice: false, owner: t1 }
  }
  return { [match.team1]: t1, [match.team2]: t2, needsChoice: false, owner: null }
}

// Only matches where both teams are owned count for points.
export function counts(match) {
  return !!(match.isContest || match.bothSameUser)
}

export function matchState(match) {
  if (match.processed || match.result) return 'done'
  const today = todayUtc()
  if (match.date === today) return 'today'
  if (match.date < today) return 'awaiting'
  return 'upcoming'
}

// Points each player got from a processed match, from this player's point of view.
export function pointsForMatch(match, myId) {
  if (!match.processed || !match.result) return null
  if (match.result.isDraw) return { me: 1, them: 1 }
  const owners = sideOwners(match)
  const winnerUser = owners[match.result.winner]
  if (!winnerUser) return null
  return winnerUser === myId ? { me: 2, them: 0 } : { me: 0, them: 2 }
}

// This game's score, worked out from this game's processed matches. (The users table keeps
// lifetime totals across games, so it isn't used for the in-game score.)
export function sessionScore(matches, myId) {
  const s = { me: 0, them: 0, won: 0, lost: 0, drawn: 0, played: 0 }
  for (const m of matches || []) {
    const p = pointsForMatch(m, myId)
    if (!p) continue
    s.me += p.me
    s.them += p.them
    s.played += 1
    if (p.me === 2) s.won += 1
    else if (p.them === 2) s.lost += 1
    else s.drawn += 1
  }
  return s
}

// The owner can pick (or change) a side until match day starts (UTC); the server enforces this too.
export function canPickSide(match, myId) {
  return !!(match.bothSameUser && match.team1Owner?.userId === myId && !match.processed && match.date > todayUtc())
}
