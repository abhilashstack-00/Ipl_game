import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'

export default function Header() {
  const { user, logout } = useAuth()
  const { session, leaveSession } = useGame()
  const location = useLocation()
  const navigate = useNavigate()

  const gameStatus = session?.session?.status
  const canLeaveGame = user && !!session && (gameStatus === 'waiting' || gameStatus === 'auction' || gameStatus === 'active')
  const mySessionPlayer = session?.players?.find(p => p.id === user?.id)
  const displayCr = mySessionPlayer?.credits ?? user?.credits ?? 0

  const navLinks = user && gameStatus === 'active' ? [
    { to: '/game/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/game/matches', label: 'Matches', icon: '🏏' },
    { to: '/game/leaderboard', label: 'Leaderboard', icon: '🏆' },
    { to: '/game/squads', label: 'Squads', icon: '👥' },
  ] : []

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleLeaveGame = async () => {
    const ok = window.confirm('Leave current game session? This will end the current session for both players.')
    if (!ok) return
    try {
      await leaveSession()
      navigate('/lobby')
    } catch {
      // No-op: existing global notifications handle request failures.
    }
  }

  return (
    <header
      className="sticky top-0 z-40 border-b border-yellow-400/30"
      style={{
        background: 'linear-gradient(135deg, #0A1628 0%, #122040 60%, #0A1628 100%)',
        boxShadow: '0 4px 30px rgba(255,215,0,0.1)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to={user ? '/lobby' : '/login'} className="flex-shrink-0">
          <div className="font-teko text-2xl font-bold tracking-widest">
            <span className="text-yellow-400">IPL </span>
            <span className="text-orange-400">STRATEGY </span>
            <span className="text-gray-400 text-base">ARENA</span>
          </div>
        </Link>

        {/* Nav */}
        {navLinks.length > 0 && (
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  location.pathname === link.to
                    ? 'bg-yellow-400 text-ipl-deep-blue'
                    : 'text-gray-400 hover:text-yellow-400 border border-transparent hover:border-yellow-400/30'
                }`}
              >
                <span className="mr-1">{link.icon}</span>{link.label}
              </Link>
            ))}
          </nav>
        )}

        {/* User info */}
        {user && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {canLeaveGame && (
              <button
                onClick={handleLeaveGame}
                className="btn-outline py-1.5 px-3 text-xs border-red-400/50 text-red-300 hover:bg-red-500/10"
              >
                Leave Game
              </button>
            )}
            <div className="hidden sm:block text-right">
              <div className="text-yellow-400 font-bold text-sm leading-none">{user.username}</div>
              <div className="text-gray-500 text-xs mt-0.5">💰 {displayCr} cr</div>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-teko font-bold text-lg text-ipl-deep-blue flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #FFD700, #FF6B35)' }}
            >
              {(user.username?.[0] || '?').toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="btn-outline py-1.5 px-3 text-xs"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Mobile nav */}
      {navLinks.length > 0 && (
        <div className="sm:hidden flex overflow-x-auto gap-1 px-4 pb-2">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                location.pathname === link.to
                  ? 'bg-yellow-400 text-ipl-deep-blue'
                  : 'text-gray-400 border border-yellow-400/20'
              }`}
            >
              {link.icon} {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
