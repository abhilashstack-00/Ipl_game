import React from 'react'
import { TeamChip, Spinner } from './UI'
import { getTeam } from '../utils/iplData'
import { counts, formatDate, matchState, pointsForMatch, sideOwners, canPickSide } from '../utils/matches'

export function PointsTag({ points, opponentName = 'them' }) {
  if (!points) return null
  if (points.me === 2) return <span className="tag-win">+2 you</span>
  if (points.them === 2) return <span className="tag-loss">+2 {opponentName}</span>
  return <span className="tag-draw">+1 each</span>
}

function ownerLabel(userId, myId, opponentName) {
  if (!userId) return null
  return userId === myId ? 'You' : opponentName
}

// "Play as" buttons for a match where you own both teams. Your opponent gets the other side.
export function SidePicker({ match, onPick, busy }) {
  const chosen = match.matchChoice?.chosenTeamId
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Pick the side you play">
      <span className="text-xs text-muted mr-0.5">Play as</span>
      {[match.team1, match.team2].map(teamId => (
        <button
          key={teamId}
          type="button"
          onClick={() => onPick(match, teamId)}
          disabled={busy}
          aria-pressed={chosen === teamId}
          className={`btn-sm btn ${chosen === teamId ? 'bg-primary text-on-primary' : 'border border-line-strong/60 hover:bg-inset'}`}
        >
          {busy ? <Spinner size="sm" /> : getTeam(teamId).short}
        </button>
      ))}
    </div>
  )
}

// One fixture as a row: date, the two teams with who plays them in this game, then state or result.
export function MatchRow({ match, myId, opponentName, onPickSide, picking, showDate = true }) {
  const state = matchState(match)
  const owners = sideOwners(match)
  const points = pointsForMatch(match, myId)
  const counted = counts(match)
  const pickable = canPickSide(match, myId)

  const side = (teamId) => {
    // Before a side is picked, both teams belong to the same player.
    const label = ownerLabel(owners.needsChoice ? owners.owner : owners[teamId], myId, opponentName)
    return (
      <div className="flex items-center gap-2 min-w-0">
        <TeamChip teamId={teamId} />
        <span className={`text-xs truncate ${label === 'You' ? 'text-ink font-medium' : 'text-muted'}`}>
          {label}
        </span>
      </div>
    )
  }

  let status
  if (state === 'done') {
    const r = match.result
    status = (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-sm text-ink-2">{r?.isDraw ? 'No result' : r?.winner ? `${getTeam(r.winner).short} won` : 'Done'}</span>
        {counted && <PointsTag points={points} opponentName={opponentName} />}
      </div>
    )
  } else if (pickable) {
    status = <SidePicker match={match} onPick={onPickSide} busy={picking === match.id} />
  } else if (match.bothSameUser && owners.needsChoice && state !== 'upcoming') {
    status = <span className="text-xs text-muted">No side picked · not scored</span>
  } else if (match.bothSameUser && owners.needsChoice) {
    status = <span className="text-xs text-muted">{opponentName} picks a side</span>
  } else if (state === 'today') {
    status = <span className="tag-accent"><span className="live-dot w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />Today</span>
  } else if (state === 'awaiting') {
    status = <span className="text-xs text-muted">Waiting for result</span>
  } else if (counted) {
    status = <span className="tag-neutral">Contest</span>
  } else {
    status = <span className="text-xs text-muted">Not scored</span>
  }

  return (
    <li className={`grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 ${counted ? '' : 'opacity-70'}`}>
      {showDate && (
        <div className="text-xs text-muted sm:text-sm leading-tight w-16 sm:w-auto">
          {formatDate(match.date)}
        </div>
      )}
      <div className="flex items-center gap-3 min-w-0">
        {side(match.team1)}
        <span className="text-xs text-muted">v</span>
        {side(match.team2)}
      </div>
      <div className="col-span-2 sm:col-span-1 flex justify-end">{status}</div>
    </li>
  )
}
