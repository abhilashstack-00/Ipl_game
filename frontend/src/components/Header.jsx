import React from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { CalendarDays, DoorOpen, LayoutDashboard, LogOut, Moon, Shield, Sun, Swords } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'
import { sessionScore } from '../utils/matches'

const GAME_LINKS = [
  { to: '/game/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/game/matches', label: 'Fixtures', icon: CalendarDays },
  { to: '/game/h2h', label: 'Head-to-head', icon: Swords },
]

export function Wordmark({ className = '' }) {
  return (
    <span className={`display text-2xl whitespace-nowrap ${className}`}>
      Strategy <span className="text-accent">Arena</span>
    </span>
  )
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button onClick={toggleTheme} className="btn-ghost p-2" aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}

export default function Header() {
  const { user, logout } = useAuth()
  const { session, matches, leaveSession } = useGame()
  const navigate = useNavigate()

  const status = session?.session?.status
  const inGame = !!user && status === 'active'
  const canLeave = !!user && !!session && ['waiting', 'auction', 'active'].includes(status)
  const opponent = session?.players?.find(p => p.id !== user?.id)
  const score = sessionScore(matches, user?.id)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleLeave = async () => {
    if (!window.confirm('Leave this game? It ends the game for both players.')) return
    try {
      await leaveSession()
      navigate('/lobby')
    } catch { /* the request error shows as a notification */ }
  }

  return (
    <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur-sm border-b border-line">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to={user ? '/lobby' : '/login'} aria-label="Strategy Arena home" className="min-w-0">
          <Wordmark />
        </Link>

        <div className="flex items-center gap-1">
          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `btn-ghost p-2 sm:px-3 ${isActive ? 'bg-inset text-ink' : ''}`}
              aria-label="Admin"
            >
              <Shield size={18} aria-hidden="true" /><span className="hidden sm:inline">Admin</span>
            </NavLink>
          )}
          <ThemeToggle />
          {user && (
            <>
              <span className="hidden md:inline text-sm text-ink-2 px-2 max-w-[10rem] truncate">{user.username}</span>
              {canLeave && (
                <button onClick={handleLeave} className="btn-ghost p-2 sm:px-3" aria-label="Leave game">
                  <DoorOpen size={18} aria-hidden="true" /><span className="hidden sm:inline">Leave game</span>
                </button>
              )}
              <button onClick={handleLogout} className="btn-ghost p-2 sm:px-3" aria-label="Log out">
                <LogOut size={18} aria-hidden="true" /><span className="hidden sm:inline">Log out</span>
              </button>
            </>
          )}
        </div>
      </div>

      {inGame && (
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between gap-3 border-t border-line sm:border-t-0">
          <nav aria-label="Game" className="flex -mb-px overflow-x-auto">
            {GAME_LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  isActive ? 'border-accent text-ink font-medium' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon size={16} aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden sm:flex items-center gap-2 text-sm" aria-label={`Score: you ${score.me}, ${opponent?.username || 'opponent'} ${score.them}`}>
            <span className="text-muted">You</span>
            <span className="score text-xl">{score.me}<span className="text-muted mx-1">–</span>{score.them}</span>
            <span className="text-muted truncate max-w-[8rem]">{opponent?.username}</span>
          </div>
        </div>
      )}
    </header>
  )
}
