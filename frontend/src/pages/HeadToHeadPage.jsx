import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, Swords } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { TeamChip, Avatar, ScoreStrip, PageHeader, SectionHeading, EmptyState } from '../components/UI'
import { MatchRow } from '../components/MatchBits'
import { getTeam } from '../utils/iplData'
import { counts, sessionScore } from '../utils/matches'

// You against your opponent: score, both squads, and every contest played so far.
export default function HeadToHeadPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches } = useGame()
  const navigate = useNavigate()

  useEffect(() => {
    if (!session) { navigate('/lobby'); return }
    if (session?.session?.id) fetchMatches(session.session.id)
  }, [session])

  if (!session) return null

  const myId = user?.id
  const me = session.players?.find(p => p.id === myId)
  const opponent = session.players?.find(p => p.id !== myId)
  const oppName = opponent?.username || 'Opponent'
  const all = matches || []
  const mine = sessionScore(all, myId)
  const theirs = sessionScore(all, opponent?.id)
  const history = all.filter(m => counts(m) && m.processed).reverse()

  const teamRecord = (teamId) => {
    const played = all.filter(m => (m.team1 === teamId || m.team2 === teamId) && m.result && !m.result.isDraw)
    const w = played.filter(m => m.result.winner === teamId).length
    return `${w}–${played.length - w}`
  }

  const rows = [
    ['Points', mine.me, mine.them],
    ['Won', mine.won, theirs.won],
    ['Lost', mine.lost, theirs.lost],
    ['No result', mine.drawn, theirs.drawn],
    ['Credits left', me?.credits ?? 0, opponent?.credits ?? 0],
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 fade-in">
      <PageHeader eyebrow={`${mine.played} contest${mine.played === 1 ? '' : 's'} played`} title="Head-to-head" />
      <ScoreStrip me={me} opponent={opponent} mine={mine.me} theirs={mine.them} className="mb-6" />

      <table className="w-full text-sm mb-10 max-w-xl">
        <caption className="sr-only">Season comparison</caption>
        <thead>
          <tr className="text-muted text-xs">
            <th scope="col" className="text-left font-normal pb-2" />
            <th scope="col" className="text-right font-normal pb-2 w-24">You</th>
            <th scope="col" className="text-right font-normal pb-2 w-24 truncate">{oppName}</th>
          </tr>
        </thead>
        <tbody className="divide-rows border-y border-line">
          {rows.map(([label, a, b]) => (
            <tr key={label}>
              <th scope="row" className="text-left font-normal py-2 text-ink-2">{label}</th>
              <td className={`text-right py-2 score text-lg ${a > b && label !== 'Lost' ? 'text-ink' : 'text-ink-2'}`}>{a}</td>
              <td className={`text-right py-2 score text-lg ${b > a && label !== 'Lost' ? 'text-ink' : 'text-ink-2'}`}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid md:grid-cols-2 gap-6 mb-10">
        {[me, opponent].map((p, i) => (
          <section key={p?.id || i} aria-label={i === 0 ? 'Your squad' : `${oppName}'s squad`}>
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={p?.username} highlight={i === 0} size="sm" />
              <h2 className="display text-xl">{i === 0 ? 'Your squad' : `${oppName}'s squad`}</h2>
            </div>
            <ul className="card divide-rows">
              {(p?.teams || []).map(t => (
                <li key={t.teamId} className="flex items-center gap-3 px-4 py-2.5">
                  <TeamChip teamId={t.teamId} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {getTeam(t.teamId).name}
                      {t.isHome && <Home size={13} className="text-muted flex-shrink-0" aria-label="Home team" />}
                    </div>
                    <div className="eyebrow">{t.pricePaid ? `${t.pricePaid} credits` : 'Free'}</div>
                  </div>
                  <div className="text-right">
                    <div className="score text-lg">{teamRecord(t.teamId)}</div>
                    <div className="eyebrow">W–L</div>
                  </div>
                </li>
              ))}
              {!p?.teams?.length && <li className="px-4 py-6 text-sm text-muted text-center">No teams.</li>}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="history-heading">
        <SectionHeading id="history-heading">Contest history</SectionHeading>
        {history.length ? (
          <ul className="card divide-rows">
            {history.map(m => <MatchRow key={m.id} match={m} myId={myId} opponentName={oppName} />)}
          </ul>
        ) : (
          <div className="card">
            <EmptyState icon={Swords} title="No contests played yet">
              When one of your teams plays one of {oppName}'s, the result and points show up here.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  )
}
