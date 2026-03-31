import React from 'react'
import { getTeam } from '../utils/iplData'

export function TeamBadge({ teamId, size = 'md' }) {
  const t = getTeam(teamId)
  const sizes = { sm: 'w-10 h-10 text-xs rounded-lg', md: 'w-14 h-14 text-sm rounded-xl', lg: 'w-20 h-20 text-base rounded-2xl' }
  return (
    <div
      className={`team-badge flex-shrink-0 font-teko font-bold tracking-wide ${sizes[size]}`}
      style={{ background: t.bg, color: t.color, borderColor: t.color + '80' }}
    >
      {t.short}
    </div>
  )
}

export function TeamCard({ teamId, owned, ownedByMe, ownerName, onBuy, onSelectHome, canBuy, squadFull, homeSelected, isHomeConflict }) {
  const t = getTeam(teamId)
  return (
    <div
      className={`card p-4 transition-all duration-200 ${!owned ? 'hover:-translate-y-1 cursor-pointer' : 'opacity-60'}`}
      style={{ borderColor: ownedByMe ? t.color + 'aa' : owned ? 'rgba(255,255,255,0.1)' : t.color + '40' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <TeamBadge teamId={teamId} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm leading-tight truncate">{t.name}</div>
          <div className="font-teko text-yellow-400 text-lg">Base: {t.basePrice}cr</div>
        </div>
      </div>
      {owned ? (
        <div className="text-center py-1">
          {ownedByMe
            ? <span className="badge badge-gold">✓ YOUR TEAM</span>
            : <span className="badge badge-red">✗ {ownerName}'s</span>
          }
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {!homeSelected && (
            <button
              className="btn-outline py-1.5 px-3 text-xs w-full"
              onClick={() => onSelectHome(teamId)}
            >
              🏠 Home Team (Free)
            </button>
          )}
          <button
            className="btn-gold py-1.5 px-3 text-xs w-full"
            onClick={() => onBuy(teamId)}
            disabled={!canBuy || squadFull}
            title={squadFull ? 'Squad full' : !canBuy ? 'Not enough cr' : ''}
          >
            Buy — {t.basePrice}cr
          </button>
        </div>
      )}
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'w-4 h-4 border-2' : size === 'lg' ? 'w-10 h-10 border-4' : 'w-6 h-6 border-2'
  return (
    <div className={`${s} border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin`} />
  )
}

export function StatBox({ label, value, color = 'text-yellow-400', sub }) {
  return (
    <div className="bg-white/5 border border-yellow-400/10 rounded-xl p-4 text-center">
      <div className={`font-teko text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-gray-400 text-xs uppercase tracking-widest mt-0.5">{label}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  )
}

export function ProgressBar({ value, max, color = 'from-yellow-400 to-orange-400' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 50
  return (
    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function SectionTitle({ children, className = '' }) {
  return (
    <h2 className={`font-teko text-yellow-400 text-2xl uppercase tracking-widest ${className}`}>
      {children}
    </h2>
  )
}

export function Alert({ type = 'info', children }) {
  const styles = {
    info: 'bg-cyan-400/10 border-cyan-400/30 text-cyan-300',
    success: 'bg-green-400/10 border-green-400/30 text-green-300',
    danger: 'bg-red-400/10 border-red-400/30 text-red-300',
    warning: 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300',
  }
  return (
    <div className={`border rounded-xl px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-ipl-mid-blue border border-yellow-400/60 rounded-2xl p-6 w-full ${width} shadow-2xl animate-fade-in`}
        style={{ boxShadow: '0 0 40px rgba(255,215,0,0.12)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-teko text-yellow-400 text-2xl uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ToastContainer({ notifications }) {
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {notifications.map(n => {
        const styles = {
          success: 'bg-green-600 text-white',
          danger: 'bg-red-600 text-white',
          warning: 'bg-yellow-500 text-black',
          info: 'bg-blue-600 text-white',
        }
        return (
          <div key={n.id} className={`px-4 py-3 rounded-xl font-semibold text-sm shadow-xl animate-fade-in ${styles[n.type] || styles.info}`}>
            {n.msg}
          </div>
        )
      })}
    </div>
  )
}

export function InviteCodeBox({ code }) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center gap-3 bg-white/5 border border-yellow-400/30 rounded-xl px-4 py-3">
      <span className="text-gray-400 text-sm uppercase tracking-wider">Invite Code:</span>
      <span className="font-teko text-yellow-400 text-2xl tracking-widest flex-1">{code}</span>
      <button className="btn-outline py-1 px-3 text-xs" onClick={copy}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-5xl mb-3">{icon}</div>
      <div className="font-teko text-xl text-gray-400 uppercase tracking-wider">{title}</div>
      {subtitle && <div className="text-sm mt-1">{subtitle}</div>}
    </div>
  )
}
