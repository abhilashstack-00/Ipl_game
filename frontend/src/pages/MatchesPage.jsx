import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { PageHeader, EmptyState } from '../components/UI'
import { MatchRow } from '../components/MatchBits'
import { getTeam } from '../utils/iplData'
import { counts, matchState } from '../utils/matches'

const FILTERS = [
  ['contests', 'Contests'],
  ['mine', 'My teams'],
  ['all', 'All fixtures'],
]

// Results are applied by the server (GET /matches applies any official result it has),
// so this page only reads; it refreshes every few seconds.
export default function MatchesPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches, chooseSide, addNotification } = useGame()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('contests')
  const [picking, setPicking] = useState('')

  useEffect(() => {
    if (!session) { navigate('/lobby'); return }
    if (session?.session?.id) fetchMatches(session.session.id)
  }, [session])

  useEffect(() => {
    if (!session?.session?.id) return
    const timerId = setInterval(() => fetchMatches(session.session.id), 5000)
    return () => clearInterval(timerId)
  }, [session?.session?.id, fetchMatches])

  if (!session) return null

  const myId = user?.id
  const opponent = session.players?.find(p => p.id !== myId)
  const oppName = opponent?.username || 'Opponent'
  const myTeams = session.players?.find(p => p.id === myId)?.teams?.map(t => t.teamId) || []
  const all = matches || []

  const filtered = all.filter(m => {
    if (filter === 'contests') return counts(m)
    if (filter === 'mine') return myTeams.includes(m.team1) || myTeams.includes(m.team2)
    return true
  })
  const upcoming = filtered.filter(m => ['upcoming', 'today'].includes(matchState(m)))
  const awaiting = filtered.filter(m => matchState(m) === 'awaiting')
  const played = filtered.filter(m => matchState(m) === 'done').reverse()
  const contestsLeft = all.filter(m => counts(m) && ['upcoming', 'today'].includes(matchState(m))).length

  const handlePick = async (match, teamId) => {
    setPicking(match.id)
    try {
      await chooseSide(session.session.id, match.id, teamId)
      addNotification(`You play as ${getTeam(teamId).short} on ${match.date}`, 'success')
    } catch (err) {
      addNotification(err.response?.data?.error || "Couldn't save your side", 'danger')
    } finally { setPicking('') }
  }

  const list = (items) => (
    <ul className="card divide-rows">
      {items.map(m => <MatchRow key={m.id} match={m} myId={myId} opponentName={oppName} onPickSide={handlePick} picking={picking} />)}
    </ul>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 fade-in">
      <PageHeader eyebrow="IPL 2026" title="Fixtures">
        {contestsLeft
          ? `${contestsLeft} contest${contestsLeft === 1 ? '' : 's'} still to play between your teams. `
          : 'No contests left to play. '}
        Only contests score, and results arrive on their own.
      </PageHeader>

      <div className="flex gap-1 border-b border-line mb-6" role="tablist" aria-label="Filter fixtures">
        {FILTERS.map(([val, label]) => (
          <button
            key={val}
            role="tab"
            aria-selected={filter === val}
            onClick={() => setFilter(val)}
            className={`px-3 py-2 -mb-px text-sm border-b-2 transition-colors ${
              filter === val ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No fixtures here">Try another filter.</EmptyState>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section aria-label="Upcoming">
              <h2 className="eyebrow mb-2">Upcoming · {upcoming.length}</h2>
              {list(upcoming)}
            </section>
          )}
          {awaiting.length > 0 && (
            <section aria-label="Waiting for a result">
              <h2 className="eyebrow mb-2">Waiting for a result · {awaiting.length}</h2>
              {list(awaiting)}
            </section>
          )}
          {played.length > 0 && (
            <section aria-label="Played">
              <h2 className="eyebrow mb-2">Played · {played.length}</h2>
              {list(played)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
