import React, { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { TeamBadge, StatBox, ProgressBar, SectionTitle } from '../components/UI'
import { getTeam } from '../utils/iplData'

export default function DashboardPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches } = useGame()
  const navigate = useNavigate()

  useEffect(() => {
    if (!session) navigate('/lobby')
    else if (session?.session?.status === 'auction') navigate('/auction')
    else if (session?.session?.id) fetchMatches(session.session.id)
  }, [session])

  if (!session) return null

  const myPlayer = session.players?.find(p => p.id === user?.id)
  const opponent = session.players?.find(p => p.id !== user?.id)
  const myTeams = myPlayer?.teams?.map(t => t.teamId) || []

  const upcomingMyMatches = (matches || []).filter(m =>
    !m.result && !m.processed && (myTeams.includes(m.team1) || myTeams.includes(m.team2))
  ).slice(0, 4)

  const contestMatches = (matches || []).filter(m => m.isContest && !m.processed).slice(0, 3)
  const completedMatches = (matches || []).filter(m => m.result || m.processed).slice(-5).reverse()

  const totalPts = (myPlayer?.points || 0) + (opponent?.points || 0)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">

      {/* Scoreboard hero */}
      <div
        className="rounded-2xl p-6 mb-8 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,107,53,0.04) 100%)',
          border: '1px solid rgba(255,215,0,0.3)',
          boxShadow: '0 8px 30px rgba(255,215,0,0.07)',
        }}
      >
        <div className="text-center mb-1">
          <div className="font-teko text-gray-400 text-sm uppercase tracking-widest">Season Standings</div>
        </div>
        <div className="grid grid-cols-3 items-center gap-4">
          {/* Player 1 */}
          <div className="text-center">
            <div className={`font-teko text-6xl font-bold ${myPlayer?.id === user?.id ? 'text-yellow-400' : 'text-cyan-400'}`}
              style={{ textShadow: myPlayer?.id === user?.id ? '0 0 20px rgba(255,215,0,0.4)' : '' }}>
              {myPlayer?.points ?? 0}
            </div>
            <div className="font-bold text-sm mt-1">{myPlayer?.username}</div>
            <div className="text-xs text-yellow-400 mt-0.5">YOU</div>
            <div className="flex justify-center gap-3 mt-2 text-xs">
              <span className="text-green-400">W:{myPlayer?.wins ?? 0}</span>
              <span className="text-red-400">L:{myPlayer?.losses ?? 0}</span>
              <span className="text-gray-400">D:{myPlayer?.draws ?? 0}</span>
            </div>
          </div>

          {/* VS */}
          <div className="text-center">
            <div className="font-teko text-4xl text-gray-600">VS</div>
            <div className="mt-2">
              <ProgressBar
                value={myPlayer?.points ?? 0}
                max={Math.max(totalPts, 1)}
                color="from-yellow-400 to-orange-400"
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">{totalPts} pts played</div>
          </div>

          {/* Opponent */}
          <div className="text-center">
            <div className="font-teko text-6xl font-bold text-cyan-400">
              {opponent?.points ?? 0}
            </div>
            <div className="font-bold text-sm mt-1">{opponent?.username || 'Opponent'}</div>
            <div className="text-xs text-cyan-400 mt-0.5">OPPONENT</div>
            <div className="flex justify-center gap-3 mt-2 text-xs">
              <span className="text-green-400">W:{opponent?.wins ?? 0}</span>
              <span className="text-red-400">L:{opponent?.losses ?? 0}</span>
              <span className="text-gray-400">D:{opponent?.draws ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatBox label="My Points" value={myPlayer?.points ?? 0} />
        <StatBox
          label="Win Rate"
          value={myPlayer?.matches_played > 0 ? `${Math.round((myPlayer.wins / myPlayer.matches_played) * 100)}%` : '—'}
          color="text-green-400"
        />
        <StatBox label="Teams Owned" value={`${myTeams.length}/5`} color="text-cyan-400" />
        <StatBox label="CR Left" value={`${myPlayer?.credits ?? 0}`} color="text-orange-400" sub="session" />
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* My squad */}
        <div>
          <SectionTitle className="text-xl mb-3">🏏 My Squad</SectionTitle>
          <div className="card p-4 space-y-2">
            {myTeams.length === 0 ? (
              <div className="text-gray-500 text-center py-6">No teams — complete the auction first!</div>
            ) : myTeams.map(tid => {
              const t = getTeam(tid)
              const teamMatches = (matches || []).filter(m => m.team1 === tid || m.team2 === tid)
              const wins = teamMatches.filter(m => m.result?.winner === tid || (m.processed && m.winner_team === tid)).length
              const played = teamMatches.filter(m => m.result || m.processed).length
              return (
                <div key={tid} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                  style={{ border: `1px solid ${t.color}20` }}>
                  <TeamBadge teamId={tid} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{t.name}</div>
                    <div className="text-xs text-gray-500">{wins}W / {played - wins}L in {played} matches</div>
                  </div>
                  <div className="font-teko text-lg" style={{ color: t.color }}>{t.short}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live contests */}
        <div>
          <SectionTitle className="text-xl mb-3">⚔️ Active Contests</SectionTitle>
          {contestMatches.length === 0 ? (
            <div className="card p-8 text-center text-gray-500">
              <div className="text-4xl mb-2">📅</div>
              <div>No active contests right now</div>
              <Link to="/game/matches" className="text-yellow-400 text-sm hover:underline mt-2 block">View full schedule →</Link>
            </div>
          ) : contestMatches.map(m => (
            <div key={m.id} className="card p-4 mb-3" style={{ borderColor: 'rgba(255,107,53,0.4)' }}>
              <div className="flex items-center gap-3">
                <TeamBadge teamId={m.team1} size="sm" />
                <div className="flex-1 text-center">
                  <div className="font-teko text-gray-400">vs</div>
                  <div className="text-xs text-gray-500">{m.date}</div>
                </div>
                <TeamBadge teamId={m.team2} size="sm" />
              </div>
              <div className="mt-2 flex justify-between items-center text-xs">
                <span className="text-orange-400">⚔️ Contest match</span>
                <Link to="/game/matches" className="badge badge-gold">Manage →</Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent results */}
      {completedMatches.length > 0 && (
        <div className="mt-8">
          <SectionTitle className="text-xl mb-3">📋 Recent Results</SectionTitle>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Match</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Venue</th>
                  <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider">Result</th>
                </tr>
              </thead>
              <tbody>
                {completedMatches.map(m => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TeamBadge teamId={m.team1} size="sm" />
                        <span className="text-gray-500 text-xs">vs</span>
                        <TeamBadge teamId={m.team2} size="sm" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{m.date}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[150px]">{m.venue}</td>
                    <td className="px-4 py-3">
                      {m.result?.winner && (
                        <span className="badge badge-green">{getTeam(m.result.winner).short} Won</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
