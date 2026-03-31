import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { TeamBadge, SectionTitle, ProgressBar } from '../components/UI'
import { getTeam } from '../utils/iplData'
import { api } from '../utils/api'

export default function LeaderboardPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches } = useGame()
  const navigate = useNavigate()
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(() => {
    if (!session) { navigate('/lobby'); return }
    if (session?.session?.id) fetchMatches(session.session.id)
    api.get('/game/leaderboard').then(r => setLeaderboard(r.data.leaderboard)).catch(console.error)
  }, [session])

  if (!session) return null

  const players = session.players || []
  const myPlayer = players.find(p => p.id === user?.id)
  const opponent = players.find(p => p.id !== user?.id)
  const sortedPlayers = [...players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))

  const completedMatches = (matches || []).filter(m => m.processed || m.result)
  const contestResults = (matches || []).filter(m => m.processed && m.isContest)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <SectionTitle className="text-3xl mb-2">🏆 Leaderboard</SectionTitle>
      <p className="text-gray-400 text-sm mb-8">Season standings · {completedMatches.length} matches completed</p>

      {/* Podium */}
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {sortedPlayers.map((p, idx) => {
          const isMe = p.id === user?.id
          const winRate = p.matches_played > 0 ? Math.round((p.wins / p.matches_played) * 100) : 0
          const leading = idx === 0

          return (
            <div
              key={p.id}
              className={`rounded-2xl p-6 relative overflow-hidden ${leading ? 'border-2 border-yellow-400/60' : 'border border-white/10'}`}
              style={{
                background: leading
                  ? 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,107,53,0.05))'
                  : 'rgba(255,255,255,0.03)',
                boxShadow: leading ? '0 0 30px rgba(255,215,0,0.1)' : 'none',
              }}
            >
              {leading && (
                <div className="absolute top-3 right-3">
                  <span className="badge badge-gold">🥇 Leading</span>
                </div>
              )}
              {!leading && idx > 0 && (
                <div className="absolute top-3 right-3">
                  <span className="badge badge-blue">🥈 #{idx + 1}</span>
                </div>
              )}

              <div className="flex items-center gap-4 mb-5">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center font-teko font-bold text-2xl"
                  style={{
                    background: isMe ? 'linear-gradient(135deg,#FFD700,#FF6B35)' : 'rgba(255,255,255,0.1)',
                    color: isMe ? '#0A1628' : '#fff',
                  }}
                >
                  {p.username[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-lg">{p.username}</div>
                  {isMe && <div className="text-yellow-400 text-xs uppercase tracking-wider">You</div>}
                </div>
              </div>

              {/* Big score */}
              <div className="flex items-baseline gap-3 mb-4">
                <div className={`font-teko font-bold text-6xl ${leading ? 'text-yellow-400' : 'text-cyan-400'}`}
                  style={{ textShadow: leading ? '0 0 20px rgba(255,215,0,0.3)' : '' }}>
                  {p.points ?? 0}
                </div>
                <div className="text-gray-400 text-sm">points</div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: 'Played', value: p.matches_played ?? 0 },
                  { label: 'Won', value: p.wins ?? 0, color: 'text-green-400' },
                  { label: 'Lost', value: p.losses ?? 0, color: 'text-red-400' },
                  { label: 'Draw', value: p.draws ?? 0, color: 'text-yellow-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-xl p-2 text-center">
                    <div className={`font-teko text-xl font-bold ${s.color || 'text-white'}`}>{s.value}</div>
                    <div className="text-gray-500 text-xs">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Win rate bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Win rate</span>
                  <span>{winRate}%</span>
                </div>
                <ProgressBar
                  value={p.wins ?? 0}
                  max={Math.max(p.matches_played ?? 0, 1)}
                  color={leading ? 'from-yellow-400 to-orange-400' : 'from-cyan-400 to-blue-500'}
                />
              </div>

              {/* Teams */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Squad</div>
                <div className="flex flex-wrap gap-1.5">
                  {(p.teams || []).map(t => (
                    <TeamBadge key={t.teamId} teamId={t.teamId} size="sm" />
                  ))}
                  {(!p.teams?.length) && <span className="text-gray-600 text-xs">No teams</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Match history */}
      <div>
        <SectionTitle className="text-xl mb-4">📋 Match History</SectionTitle>
        {completedMatches.length === 0 ? (
          <div className="card p-10 text-center text-gray-500">
            <div className="text-4xl mb-2">📅</div>
            No completed matches yet. Go to the Matches tab to process results!
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Match</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider hidden md:table-cell">Venue</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Result</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Points</th>
                </tr>
              </thead>
              <tbody>
                {completedMatches.map((m, idx) => {
                  const t1mine = myPlayer?.teams?.some(t => t.teamId === m.team1)
                  const t2mine = myPlayer?.teams?.some(t => t.teamId === m.team2)
                  const iWon = (m.result?.winner && ((t1mine && m.result.winner === m.team1) || (t2mine && m.result.winner === m.team2)))
                  const isContest = m.isContest

                  return (
                    <tr key={m.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-gray-600 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TeamBadge teamId={m.team1} size="sm" />
                          <span className="text-gray-600 text-xs">vs</span>
                          <TeamBadge teamId={m.team2} size="sm" />
                          {isContest && <span className="badge badge-orange hidden sm:inline">⚔️</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">{m.date}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[140px] hidden md:table-cell">{m.venue}</td>
                      <td className="px-4 py-3">
                        {m.result?.winner && (
                          <div className="flex items-center gap-1.5">
                            <TeamBadge teamId={m.result.winner} size="sm" />
                            <span className="badge badge-green text-xs">Won</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isContest && (
                          iWon
                            ? <span className="badge badge-green">+2</span>
                            : <span className="badge badge-red">+0</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
