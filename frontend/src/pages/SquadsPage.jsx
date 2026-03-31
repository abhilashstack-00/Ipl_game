import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { TeamBadge, SectionTitle, StatBox } from '../components/UI'
import { getTeam } from '../utils/iplData'

export default function SquadsPage() {
  const { user } = useAuth()
  const { session, matches, fetchMatches } = useGame()
  const navigate = useNavigate()

  useEffect(() => {
    if (!session) { navigate('/lobby'); return }
    if (session?.session?.id) fetchMatches(session.session.id)
  }, [session])

  if (!session) return null

  const players = session.players || []
  const myPlayer = players.find(p => p.id === user?.id)
  const opponent = players.find(p => p.id !== user?.id)

  const getTeamStats = (teamId) => {
    const teamMatches = (matches || []).filter(m => m.team1 === teamId || m.team2 === teamId)
    const completed = teamMatches.filter(m => m.result)
    const wins = completed.filter(m => m.result?.winner === teamId).length
    return { played: completed.length, wins, losses: completed.length - wins }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <SectionTitle className="text-3xl mb-2">👥 Squad Comparison</SectionTitle>
      <p className="text-gray-400 text-sm mb-8">Head-to-head team breakdown</p>

      {/* Summary compare */}
      <div
        className="rounded-2xl p-6 mb-8"
        style={{
          background: 'linear-gradient(135deg, rgba(255,215,0,0.04), rgba(0,229,255,0.04))',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="grid grid-cols-3 gap-4 text-center">
          {/* My column */}
          <div>
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-teko font-bold text-2xl mx-auto mb-2"
              style={{ background: 'linear-gradient(135deg,#FFD700,#FF6B35)', color: '#0A1628' }}
            >
              {myPlayer?.username?.[0]?.toUpperCase() || 'M'}
            </div>
            <div className="font-bold">{myPlayer?.username}</div>
            <div className="text-yellow-400 text-xs">YOU</div>
          </div>

          {/* Stats middle */}
          <div className="flex flex-col justify-center gap-3">
            {[
              { label: 'Points', mine: myPlayer?.points ?? 0, theirs: opponent?.points ?? 0 },
              { label: 'Wins', mine: myPlayer?.wins ?? 0, theirs: opponent?.wins ?? 0 },
              { label: 'Teams', mine: myPlayer?.teams?.length ?? 0, theirs: opponent?.teams?.length ?? 0 },
            ].map(stat => (
              <div key={stat.label} className="text-xs">
                <div className="text-gray-500 uppercase tracking-wider mb-1">{stat.label}</div>
                <div className="flex items-center justify-center gap-3">
                  <span className={`font-teko text-lg ${stat.mine > stat.theirs ? 'text-yellow-400' : 'text-gray-400'}`}>{stat.mine}</span>
                  <span className="text-gray-600">—</span>
                  <span className={`font-teko text-lg ${stat.theirs > stat.mine ? 'text-cyan-400' : 'text-gray-400'}`}>{stat.theirs}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Opponent column */}
          <div>
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-teko font-bold text-2xl mx-auto mb-2"
              style={{ background: 'rgba(0,229,255,0.2)', color: '#00E5FF' }}
            >
              {opponent?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="font-bold">{opponent?.username || 'Waiting...'}</div>
            <div className="text-cyan-400 text-xs">OPPONENT</div>
          </div>
        </div>
      </div>

      {/* Squad details */}
      <div className="grid sm:grid-cols-2 gap-6">
        {[
          { player: myPlayer, isMe: true },
          { player: opponent, isMe: false },
        ].map(({ player, isMe }) => (
          <div key={isMe ? 'me' : 'opp'}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-teko font-bold"
                style={{
                  background: isMe ? 'linear-gradient(135deg,#FFD700,#FF6B35)' : 'rgba(0,229,255,0.2)',
                  color: isMe ? '#0A1628' : '#00E5FF',
                }}
              >
                {player?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-bold">{player?.username || (isMe ? 'You' : 'Opponent')}</div>
                <div className={`text-xs ${isMe ? 'text-yellow-400' : 'text-cyan-400'}`}>
                  {isMe ? 'YOUR SQUAD' : "OPPONENT'S SQUAD"}
                </div>
              </div>
              <div className="ml-auto">
                <span className={`badge ${isMe ? 'badge-gold' : 'badge-blue'}`}>
                  💰 {player?.credits ?? 0}cr left
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatBox label="Points" value={player?.points ?? 0} color={isMe ? 'text-yellow-400' : 'text-cyan-400'} />
              <StatBox label="Wins" value={player?.wins ?? 0} color="text-green-400" />
              <StatBox label="Losses" value={player?.losses ?? 0} color="text-red-400" />
            </div>

            {/* Teams */}
            <div className="space-y-2">
              {(player?.teams || []).map(t => {
                const team = getTeam(t.teamId)
                const stats = getTeamStats(t.teamId)
                return (
                  <div
                    key={t.teamId}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${team.color}20` }}
                  >
                    <TeamBadge teamId={t.teamId} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{team.name}</div>
                      <div className="text-xs text-gray-500">
                        {stats.wins}W / {stats.losses}L · {stats.played} matches
                        {t.isHome && ' · 🏠 Home'}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-teko text-base" style={{ color: team.color }}>{team.short}</div>
                      <div className="text-xs text-gray-500">{t.pricePaid === 0 ? 'Free' : `${t.pricePaid}cr`}</div>
                    </div>
                  </div>
                )
              })}

              {(!player?.teams?.length) && (
                <div className="text-center py-8 text-gray-600">
                  <div className="text-3xl mb-2">🏏</div>
                  No teams selected yet
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Head-to-head contested matches */}
      {(matches || []).filter(m => m.isContest).length > 0 && (
        <div className="mt-10">
          <SectionTitle className="text-xl mb-4">⚔️ Head-to-Head Contests</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            {(matches || []).filter(m => m.isContest).map(m => {
              const done = m.processed || !!m.result
              const t1mine = myPlayer?.teams?.some(t => t.teamId === m.team1)
              const t2mine = myPlayer?.teams?.some(t => t.teamId === m.team2)
              const iWon = done && m.result?.winner && ((t1mine && m.result.winner === m.team1) || (t2mine && m.result.winner === m.team2))

              return (
                <div
                  key={m.id}
                  className="rounded-xl p-4"
                  style={{
                    background: done ? (iWon ? 'rgba(0,200,83,0.06)' : 'rgba(255,23,68,0.05)') : 'rgba(255,255,255,0.03)',
                    border: done ? (iWon ? '1px solid rgba(0,200,83,0.3)' : '1px solid rgba(255,23,68,0.2)') : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <TeamBadge teamId={m.team1} size="sm" />
                      <span className="text-gray-500 text-xs font-teko text-lg">vs</span>
                      <TeamBadge teamId={m.team2} size="sm" />
                    </div>
                    {done ? (
                      iWon
                        ? <span className="badge badge-green">You Won +2</span>
                        : <span className="badge badge-red">You Lost</span>
                    ) : (
                      <span className="badge badge-blue">Upcoming</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">{m.date} · {m.venue}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
