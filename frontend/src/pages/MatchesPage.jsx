import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { TeamBadge, Modal, Alert, Spinner, SectionTitle } from '../components/UI'
import { getTeam } from '../utils/iplData'

function MatchStatusBadge({ match }) {
  const today = new Date().toISOString().split('T')[0]
  if (match.processed || match.result) return <span className="badge badge-green">✓ Done</span>
  if (match.date < today) return <span className="badge badge-orange live-pulse">● Live</span>
  if (match.date === today) return <span className="badge" style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.4)' }}>Today</span>
  return <span className="badge badge-blue">Upcoming</span>
}

export default function MatchesPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches, processMatch, addNotification } = useGame()
  const navigate = useNavigate()
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [simulResult, setSimulResult] = useState(null)
  const [processing, setProcessing] = useState('')
  const [filter, setFilter] = useState('all') // all | contest | mine

  useEffect(() => {
    if (!session) { navigate('/lobby'); return }
    if (session?.session?.id) fetchMatches(session.session.id)
  }, [session])

  if (!session) return null

  const myPlayer = session.players?.find(p => p.id === user?.id)
  const myTeams = myPlayer?.teams?.map(t => t.teamId) || []

  const filtered = (matches || []).filter(m => {
    if (filter === 'contest') return m.isContest
    if (filter === 'mine') return myTeams.includes(m.team1) || myTeams.includes(m.team2)
    return true
  })

  const simulate = (match) => {
    const winner = Math.random() > 0.5 ? match.team1 : match.team2
    setSimulResult({ matchId: match.id, winner })
    setSelectedMatch(match)
  }

  const handleProcess = async (match, winnerTeamId, isDraw = false) => {
    setProcessing(match.id)
    try {
      const result = await processMatch(session.session.id, match.id, winnerTeamId, isDraw)
      addNotification(result.message, 'success')
      setSelectedMatch(null)
      setSimulResult(null)
    } catch (err) {
      addNotification(err.response?.data?.error || 'Failed to process match', 'danger')
    } finally { setProcessing('') }
  }

  return (
    <div className="min-h-screen w-full px-3 sm:px-4 py-6 sm:py-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <SectionTitle className="text-3xl">📅 IPL 2025 Schedule</SectionTitle>
          <p className="text-gray-400 text-sm mt-1">
            {(matches || []).filter(m => m.isContest && !m.processed).length} active contests · {(matches || []).filter(m => m.processed || m.result).length} completed
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {[['all', 'All'], ['contest', '⚔️ Contests'], ['mine', '🏏 My Teams']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                filter === val ? 'bg-yellow-400 text-ipl-deep-blue' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-400/60 inline-block" />Your team</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-cyan-400/60 inline-block" />Opponent's team</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-400/60 inline-block" />Contest match</span>
      </div>

      {/* Match list */}
      <div className="space-y-2">
        {filtered.map(match => {
          const isContestMatch = match.isContest
          const bothSame = match.bothSameUser
          const myTeamInMatch = myTeams.includes(match.team1) || myTeams.includes(match.team2)
          const done = match.processed || !!match.result
          const isSimulated = simulResult?.matchId === match.id
          const today = new Date().toISOString().split('T')[0]
          const isLive = match.date <= today && !done

          return (
            <div
              key={match.id}
              className={`rounded-xl p-4 border transition-all ${
                isContestMatch && !done
                  ? 'border-orange-400/40 hover:border-orange-400/70'
                  : done
                  ? 'border-green-400/20 opacity-80'
                  : 'border-white/10 hover:border-white/20'
              }`}
              style={{
                background: isContestMatch && !done
                  ? 'rgba(255,107,53,0.05)'
                  : 'rgba(255,255,255,0.03)',
              }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                {/* Team 1 */}
                <div className="flex flex-col items-center gap-1 w-14">
                  <TeamBadge teamId={match.team1} size="sm" />
                  {match.team1Owner && (
                    <span className={`text-xs font-bold ${match.team1Owner.userId === user?.id ? 'text-yellow-400' : 'text-cyan-400'}`}>
                      {match.team1Owner.userId === user?.id ? 'YOU' : 'OPP'}
                    </span>
                  )}
                </div>

                {/* Center */}
                <div className="flex-1 text-center min-w-0">
                  <div className="font-teko text-gray-400 text-lg">
                    {getTeam(match.team1).short}
                    {done && match.result?.winner ? (
                      <span className="mx-2 text-white text-sm">
                        {match.result.winner === match.team1 ? '🏆' : ''}
                      </span>
                    ) : isSimulated ? (
                      <span className="mx-2 text-orange-400 text-sm font-bold">
                        {simulResult.winner === match.team1 ? '★' : ''}
                      </span>
                    ) : null}
                    {' '}vs{' '}
                    {isSimulated && simulResult.winner === match.team2 ? <span className="text-orange-400">★</span> : null}
                    {done && match.result?.winner === match.team2 ? '🏆' : ''}
                    {getTeam(match.team2).short}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{match.venue}</div>
                  <div className="text-xs text-gray-600">{match.date}</div>

                  <div className="flex justify-center flex-wrap gap-1.5 mt-1.5">
                    <MatchStatusBadge match={match} />
                    {isContestMatch && !done && <span className="badge badge-orange">⚔️ Contest</span>}
                    {bothSame && <span className="badge badge-blue">Both Yours</span>}
                    {isSimulated && <span className="badge badge-gold">Simulated</span>}
                  </div>
                </div>

                {/* Team 2 */}
                <div className="flex flex-col items-center gap-1 w-14">
                  <TeamBadge teamId={match.team2} size="sm" />
                  {match.team2Owner && (
                    <span className={`text-xs font-bold ${match.team2Owner.userId === user?.id ? 'text-yellow-400' : 'text-cyan-400'}`}>
                      {match.team2Owner.userId === user?.id ? 'YOU' : 'OPP'}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 min-w-[120px]">
                  {done ? (
                    match.result?.winner ? (
                      <span className="badge badge-green text-center">{getTeam(match.result.winner).short} Won</span>
                    ) : (
                      <span className="badge badge-gold text-center">Processed</span>
                    )
                  ) : isContestMatch && isLive ? (
                    <>
                      {!isSimulated ? (
                        <button
                          className="btn-success py-1.5 px-3 text-xs"
                          onClick={() => simulate(match)}
                        >
                          🎲 Simulate
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn-gold py-1.5 px-3 text-xs"
                            onClick={() => handleProcess(match, simulResult.winner)}
                            disabled={processing === match.id}
                          >
                            {processing === match.id ? <Spinner size="sm" /> : '✓ Apply Result'}
                          </button>
                          <button
                            className="btn-outline py-1.5 px-3 text-xs"
                            onClick={() => setSimulResult(null)}
                          >
                            Re-simulate
                          </button>
                        </>
                      )}
                      <button
                        className="btn-outline py-1 px-2 text-xs"
                        onClick={() => setSelectedMatch(match)}
                      >
                        Manual
                      </button>
                    </>
                  ) : isContestMatch && !isLive ? (
                    <span className="text-xs text-gray-500 text-center">Match not started</span>
                  ) : bothSame ? (
                    <span className="text-xs text-gray-500 text-center">No contest</span>
                  ) : (
                    <span className="text-xs text-gray-600 text-center">—</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-3">📅</div>
            <div>No matches found for this filter</div>
          </div>
        )}
      </div>

      {/* Manual result modal */}
      <Modal
        open={!!selectedMatch && !simulResult}
        onClose={() => setSelectedMatch(null)}
        title="Enter Match Result"
      >
        {selectedMatch && (
          <div>
            <div className="flex items-center justify-around mb-6">
              <div className="text-center">
                <TeamBadge teamId={selectedMatch.team1} size="lg" />
                <div className="mt-2 font-bold">{getTeam(selectedMatch.team1).name}</div>
                <button
                  className="btn-gold py-2 px-5 text-sm mt-3"
                  onClick={() => handleProcess(selectedMatch, selectedMatch.team1)}
                  disabled={!!processing}
                >
                  {processing ? <Spinner size="sm" /> : 'Won'}
                </button>
              </div>
              <div className="text-center">
                <div className="font-teko text-3xl text-gray-500">VS</div>
                <button
                  className="btn-outline py-2 px-4 text-sm mt-3 block"
                  onClick={() => handleProcess(selectedMatch, null, true)}
                  disabled={!!processing}
                >
                  Draw
                </button>
              </div>
              <div className="text-center">
                <TeamBadge teamId={selectedMatch.team2} size="lg" />
                <div className="mt-2 font-bold">{getTeam(selectedMatch.team2).name}</div>
                <button
                  className="btn-gold py-2 px-5 text-sm mt-3"
                  onClick={() => handleProcess(selectedMatch, selectedMatch.team2)}
                  disabled={!!processing}
                >
                  {processing ? <Spinner size="sm" /> : 'Won'}
                </button>
              </div>
            </div>
            <Alert type="info">
              Winner gets +2 pts · Draw gives +1 pt each · Loser gets 0
            </Alert>
          </div>
        )}
      </Modal>
      </div>
    </div>
  )
}
