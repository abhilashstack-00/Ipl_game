import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Home } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { TeamChip, ScoreStrip, Stat, EmptyState, SectionHeading, Alert } from '../components/UI'
import { MatchRow, SidePicker } from '../components/MatchBits'
import { getTeam } from '../utils/iplData'
import { counts, formatDate, matchState, sessionScore, sideOwners, canPickSide } from '../utils/matches'

export default function DashboardPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches, chooseSide, addNotification } = useGame()
  const navigate = useNavigate()
  const [picking, setPicking] = useState('')

  useEffect(() => {
    if (!session) navigate('/lobby')
    else if (session?.session?.status === 'auction') navigate('/auction')
    else if (session?.session?.id) fetchMatches(session.session.id)
  }, [session])

  if (!session) return null

  const myId = user?.id
  const me = session.players?.find(p => p.id === myId)
  const opponent = session.players?.find(p => p.id !== myId)
  const oppName = opponent?.username || 'Opponent'
  const all = matches || []
  const score = sessionScore(all, myId)

  const upcomingContests = all.filter(m => counts(m) && ['upcoming', 'today'].includes(matchState(m)))
  const seasonOver = all.length > 0 && !all.some(m => ['upcoming', 'today'].includes(matchState(m)))
  const awaitingCount = all.filter(m => counts(m) && matchState(m) === 'awaiting').length
  const next = upcomingContests[0]
  const needChoice = all.filter(m => canPickSide(m, myId) && !m.matchChoice)
  const recent = all.filter(m => counts(m) && m.processed).slice(-5).reverse()

  const handlePick = async (match, teamId) => {
    setPicking(match.id)
    try {
      await chooseSide(session.session.id, match.id, teamId)
      addNotification(`You play as ${getTeam(teamId).short}; ${oppName} gets the other side`, 'success')
    } catch (err) {
      addNotification(err.response?.data?.error || "Couldn't save your side", 'danger')
    } finally { setPicking('') }
  }

  const teamRecord = (teamId) => {
    const played = all.filter(m => (m.team1 === teamId || m.team2 === teamId) && m.result && !m.result.isDraw)
    const w = played.filter(m => m.result.winner === teamId).length
    return `${w}–${played.length - w}`
  }

  let nextSides = null
  if (next) {
    const owners = sideOwners(next)
    const mine = [next.team1, next.team2].find(t => owners[t] === myId)
    const theirs = [next.team1, next.team2].find(t => owners[t] && owners[t] !== myId)
    nextSides = { mine, theirs, needsChoice: owners.needsChoice }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 fade-in">
      <ScoreStrip me={me} opponent={opponent} mine={score.me} theirs={score.them} className="mb-6" />

      {needChoice.length > 0 && (
        <Alert type="warning" className="mb-6">
          <div className="font-medium mb-2">
            You own both teams in {needChoice.length === 1 ? 'a match' : `${needChoice.length} matches`}. Pick the side you play before match day, or it won't score.
          </div>
          <ul className="space-y-2">
            {needChoice.slice(0, 3).map(m => (
              <li key={m.id} className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-ink-2 w-24">{formatDate(m.date)}</span>
                <SidePicker match={m} onPick={handlePick} busy={picking === m.id} />
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Next contest */}
          <section className="card p-5" aria-labelledby="next-heading">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 id="next-heading" className="eyebrow">Next contest</h2>
              {next && <span className={matchState(next) === 'today' ? 'tag-accent' : 'tag-neutral'}>{matchState(next) === 'today' ? 'Today' : formatDate(next.date)}</span>}
            </div>
            {next ? (
              <>
                <div className="flex items-center gap-4">
                  <TeamChip teamId={next.team1} size="lg" />
                  <span className="display text-xl text-muted">v</span>
                  <TeamChip teamId={next.team2} size="lg" />
                </div>
                <p className="mt-4 text-ink-2">
                  {nextSides.needsChoice
                    ? `You own both teams. Pick your side before match day.`
                    : <>Your <strong className="text-ink">{getTeam(nextSides.mine).short}</strong> against {oppName}'s <strong className="text-ink">{getTeam(nextSides.theirs).short}</strong>. A win is worth 2 points.</>}
                </p>
                <p className="text-sm text-muted mt-1">{next.venue}</p>
              </>
            ) : (
              <EmptyState icon={CalendarDays} title={seasonOver ? 'No fixtures left this season' : 'No more contests scheduled'}>
                {seasonOver
                  ? 'Every match in the schedule has been played.'
                  : "None of the remaining fixtures put your teams against your opponent's."}
                {awaitingCount > 0 && ` ${awaitingCount} contest${awaitingCount === 1 ? ' is' : 's are'} still waiting for an official result.`}
              </EmptyState>
            )}
          </section>

          {/* Upcoming */}
          <section aria-labelledby="upcoming-heading">
            <SectionHeading id="upcoming-heading" aside={<Link to="/game/matches" className="inline-flex items-center gap-1 text-accent hover:underline">All fixtures<ArrowRight size={14} aria-hidden="true" /></Link>}>
              Coming up
            </SectionHeading>
            {upcomingContests.length > 1 ? (
              <ul className="card divide-rows">
                {upcomingContests.slice(1, 6).map(m => (
                  <MatchRow key={m.id} match={m} myId={myId} opponentName={oppName} onPickSide={handlePick} picking={picking} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing else scheduled between your teams.</p>
            )}
          </section>

          {/* Recent */}
          <section aria-labelledby="recent-heading">
            <SectionHeading id="recent-heading">Recent results</SectionHeading>
            {recent.length ? (
              <ul className="card divide-rows">
                {recent.map(m => <MatchRow key={m.id} match={m} myId={myId} opponentName={oppName} />)}
              </ul>
            ) : (
              <p className="text-sm text-muted">No contests have been played yet. Results appear here automatically.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6 min-w-0">
          <section aria-labelledby="record-heading">
            <SectionHeading id="record-heading">Your record</SectionHeading>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Won" value={score.won} tone="win" />
              <Stat label="Lost" value={score.lost} tone="loss" />
              <Stat label="No result" value={score.drawn} tone="draw" />
            </div>
          </section>

          <section aria-labelledby="squad-heading">
            <SectionHeading id="squad-heading" aside={`${me?.credits ?? 0} credits left`}>Your squad</SectionHeading>
            <ul className="card divide-rows">
              {(me?.teams || []).map(t => (
                <li key={t.teamId} className="flex items-center gap-3 px-4 py-2.5">
                  <TeamChip teamId={t.teamId} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {getTeam(t.teamId).name}
                      {t.isHome && <Home size={13} className="text-muted flex-shrink-0" aria-label="Home team" />}
                    </div>
                    <div className="eyebrow">{t.pricePaid ? `${t.pricePaid} credits` : 'Free'}{t.autoAssigned ? ' · base price' : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="score text-lg">{teamRecord(t.teamId)}</div>
                    <div className="eyebrow">W–L</div>
                  </div>
                </li>
              ))}
              {!me?.teams?.length && <li className="px-4 py-6 text-sm text-muted text-center">No teams yet.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
