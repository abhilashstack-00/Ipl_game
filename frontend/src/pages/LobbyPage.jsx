import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { InviteCodeBox, Alert, Spinner, SectionTitle } from '../components/UI'

export default function LobbyPage() {
  const { user } = useAuth()
  const { session, createSession, joinSession, loading } = useGame()
  const navigate = useNavigate()
  const [inviteInput, setInviteInput] = useState('')
  const [joinError, setJoinError] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const waitingForOpponent = session?.session?.status === 'waiting'

  // Already has a session — redirect appropriately
  React.useEffect(() => {
    if (session) {
      const status = session.session?.status
      if (status === 'active') navigate('/game/dashboard')
      else if (status === 'auction') navigate('/auction')
    }
  }, [session, navigate])

  const handleCreate = async () => {
    setCreateError('')
    setCreating(true)
    try {
      const s = await createSession()
      const status = s?.session?.status
      if (status === 'active') navigate('/game/dashboard')
      else if (status === 'auction') navigate('/auction')
      else if (status !== 'waiting') setCreateError('Session created, but navigation state was unexpected. Please refresh.')
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create game session')
    } finally { setCreating(false) }
  }

  const handleJoin = async () => {
    if (!inviteInput.trim()) return
    setJoinError('')
    setJoining(true)
    try {
      const s = await joinSession(inviteInput.trim().toUpperCase())
      if (s?.session?.status === 'auction') navigate('/auction')
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join session')
    } finally { setJoining(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )

  return (
    <div
      className="min-h-screen bg-cricket-pattern"
      style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(255,107,53,0.07) 0%, transparent 50%), #0A1628' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in">
        {/* Welcome banner */}
        <div className="text-center mb-12">
          <div
            className="inline-block px-6 py-2 rounded-full mb-4 text-xs font-bold uppercase tracking-widest"
            style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}
          >
            Welcome, {user?.username}!
          </div>
          <h1 className="font-teko text-5xl text-yellow-400 uppercase tracking-widest leading-none">
            Game Lobby
          </h1>
          <p className="text-gray-400 mt-2">Two managers. Ten teams. One IPL season.</p>
        </div>

        {/* How to play */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { icon: '💰', title: '100 CR', desc: 'Budget per player per game' },
            { icon: '🔨', title: 'Auction', desc: 'Bid on IPL teams' },
            { icon: '⚔️', title: 'Compete', desc: 'Win when your teams win' },
            { icon: '🏆', title: 'Champion', desc: 'Most points wins' },
          ].map(h => (
            <div key={h.title} className="card p-4 text-center">
              <div className="text-3xl mb-2">{h.icon}</div>
              <div className="font-bold text-yellow-400 text-sm">{h.title}</div>
              <div className="text-gray-500 text-xs mt-1">{h.desc}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {waitingForOpponent && (
          <div className="mb-6">
            <Alert type="warning">
              ⏳ Session created. Waiting for player 2 to join with your invite code.
            </Alert>
            <div className="mt-3">
              <InviteCodeBox code={session?.session?.inviteCode} />
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Create session */}
          <div
            className="rounded-2xl p-8"
            style={{
              background: 'rgba(18,32,64,0.8)',
              border: '1px solid rgba(255,215,0,0.25)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            }}
          >
            <div className="text-4xl mb-3">🚀</div>
            <h3 className="font-teko text-2xl text-yellow-400 uppercase tracking-wider mb-2">Create New Game</h3>
            <p className="text-gray-400 text-sm mb-6">
              Start a fresh game session and invite your opponent using the generated invite code.
            </p>
            {createError && (
              <Alert type="danger">
                {createError}
              </Alert>
            )}
            <button
              className="btn-gold w-full py-3 text-base"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? <span className="flex items-center justify-center gap-2"><Spinner size="sm" /> Creating...</span> : '🏏 Create Game Session'}
            </button>
          </div>

          {/* Join session */}
          <div
            className="rounded-2xl p-8"
            style={{
              background: 'rgba(18,32,64,0.8)',
              border: '1px solid rgba(255,215,0,0.25)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            }}
          >
            <div className="text-4xl mb-3">🔗</div>
            <h3 className="font-teko text-2xl text-yellow-400 uppercase tracking-wider mb-2">Join a Game</h3>
            <p className="text-gray-400 text-sm mb-4">
              Enter the 6-character invite code shared by your opponent to join their session.
            </p>
            {joinError && (
              <Alert type="danger" className="mb-3">{joinError}</Alert>
            )}
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Enter invite code"
                value={inviteInput}
                onChange={e => setInviteInput(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontFamily: 'Teko', fontSize: '1.2rem' }}
              />
              <button
                className="btn-gold px-5 py-3"
                onClick={handleJoin}
                disabled={joining || !inviteInput.trim()}
              >
                {joining ? <Spinner size="sm" /> : 'Join'}
              </button>
            </div>
          </div>
        </div>

        {/* Points system */}
        <div className="mt-8 card p-6">
          <SectionTitle className="text-lg mb-4">📋 Points System</SectionTitle>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="badge badge-green text-base px-3 py-1">+2</span>
              <span className="text-gray-300">Your team wins a match</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge badge-gold text-base px-3 py-1">+1</span>
              <span className="text-gray-300">Match ends in a draw/tie</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge badge-red text-base px-3 py-1"> 0</span>
              <span className="text-gray-300">Your team loses</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 text-xs text-gray-500">
            <strong className="text-yellow-400">Special Rule:</strong> If you own both teams in a match, the opponent gets the other team temporarily for that match. No free points!
          </div>
        </div>
      </div>
    </div>
  )
}
