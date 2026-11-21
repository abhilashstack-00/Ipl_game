import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, CheckCircle2, Copy, Info, X, XCircle } from 'lucide-react'
import { getTeam } from '../utils/iplData'

// ---------------------------------------------------------------------------
// Teams and players
// ---------------------------------------------------------------------------

const CHIP_SIZES = {
  sm: 'h-6 min-w-[2.5rem] px-1.5 text-[13px]',
  md: 'h-8 min-w-[3rem] px-2 text-base',
  lg: 'h-14 min-w-[4.5rem] px-3 text-2xl',
}

// A team's short code on its own colours. Team colours appear only here, so they stay meaningful.
export function TeamChip({ teamId, size = 'md', className = '' }) {
  const t = getTeam(teamId)
  return (
    <span
      className={`score inline-flex items-center justify-center rounded ${CHIP_SIZES[size]} ${className}`}
      style={{ background: t.bg, color: t.color }}
      title={t.name}
      aria-label={t.name}
    >
      {t.short}
    </span>
  )
}

export function Avatar({ name, highlight = false, size = 'md' }) {
  const s = size === 'lg' ? 'w-12 h-12 text-lg' : size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <span
      aria-hidden="true"
      className={`${s} inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold ${
        highlight ? 'bg-primary text-on-primary' : 'bg-inset text-ink-2 border border-line'
      }`}
    >
      {(name?.[0] || '?').toUpperCase()}
    </span>
  )
}

// Broadcast-style score strip: you on the left, opponent on the right.
export function ScoreStrip({ me, opponent, mine = 0, theirs = 0, className = '' }) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-stretch border border-line rounded-card overflow-hidden bg-surface ${className}`}
      aria-label={`Score: you ${mine}, ${opponent?.username || 'opponent'} ${theirs}`}
    >
      <div className="px-3 py-2 min-w-0">
        <div className="eyebrow">You</div>
        <div className="text-sm font-medium truncate">{me?.username || '—'}</div>
      </div>
      <div className="score flex items-center gap-2 px-4 bg-inset text-3xl" aria-hidden="true">
        <span className={mine >= theirs ? 'text-ink' : 'text-ink-2'}>{mine}</span>
        <span className="text-muted text-xl">–</span>
        <span className={theirs > mine ? 'text-ink' : 'text-ink-2'}>{theirs}</span>
      </div>
      <div className="px-3 py-2 min-w-0 text-right">
        <div className="eyebrow">Opponent</div>
        <div className="text-sm font-medium truncate">{opponent?.username || 'Waiting…'}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout and feedback
// ---------------------------------------------------------------------------

export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="display text-3xl sm:text-4xl">{title}</h1>
        {children && <p className="text-ink-2 mt-2 max-w-2xl">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SectionHeading({ children, aside, id }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <h2 id={id} className="display text-xl">{children}</h2>
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  )
}

export function Spinner({ size = 'md', label = 'Loading' }) {
  const s = size === 'sm' ? 'w-4 h-4 border-2' : size === 'lg' ? 'w-9 h-9 border-[3px]' : 'w-6 h-6 border-2'
  return (
    <span role="status" className="inline-flex">
      <span className={`${s} rounded-full border-current border-r-transparent animate-spin opacity-70`} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

const ALERT_STYLES = {
  info: { box: 'bg-inset border-line', icon: Info, iconClass: 'text-ink-2' },
  success: { box: 'bg-win/10 border-win/30', icon: CheckCircle2, iconClass: 'text-win' },
  warning: { box: 'bg-draw/10 border-draw/30', icon: AlertTriangle, iconClass: 'text-draw' },
  danger: { box: 'bg-loss/10 border-loss/30', icon: XCircle, iconClass: 'text-loss' },
}

export function Alert({ type = 'info', children, className = '' }) {
  const s = ALERT_STYLES[type] || ALERT_STYLES.info
  const Icon = s.icon
  return (
    <div className={`flex gap-2.5 border rounded px-3 py-2.5 text-sm text-ink ${s.box} ${className}`} role={type === 'danger' ? 'alert' : undefined}>
      <Icon size={18} className={`flex-shrink-0 mt-px ${s.iconClass}`} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="text-center py-12 px-4">
      {Icon && <Icon size={28} className="mx-auto mb-3 text-muted" aria-hidden="true" />}
      <div className="font-medium">{title}</div>
      {children && <p className="text-sm text-muted mt-1 max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, tone }) {
  const color = tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : tone === 'draw' ? 'text-draw' : 'text-ink'
  return (
    <div className="bg-inset rounded px-3 py-2.5">
      <div className={`score text-2xl ${color}`}>{value}</div>
      <div className="eyebrow mt-1">{label}</div>
    </div>
  )
}

// Rendered into document.body through a portal, so no transformed ancestor can move it off-screen.
export function Modal({ open, onClose, title, children, width = 'max-w-md' }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Runs only when the dialog opens or closes. (Depending on onClose would re-run it on every
  // re-render, e.g. every second on the auction page, and steal focus from the field being typed in.)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKey)
    // Move focus into the dialog unless a field inside it already took it (autoFocus).
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`card w-full ${width} p-5 sm:p-6 fade-in rounded-b-none sm:rounded-card max-h-[90vh] overflow-y-auto focus:outline-none`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="display text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="btn-ghost p-1.5 -mr-1.5 -mt-1">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

const TOAST_ICONS = { success: CheckCircle2, danger: XCircle, warning: AlertTriangle, info: Info }
const TOAST_COLORS = { success: 'text-win', danger: 'text-loss', warning: 'text-draw', info: 'text-ink-2' }

export function ToastContainer({ notifications }) {
  return (
    <div className="fixed z-50 bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-80 flex flex-col gap-2" aria-live="polite">
      {notifications.map(n => {
        const Icon = TOAST_ICONS[n.type] || Info
        return (
          <div key={n.id} className="card flex gap-2.5 px-3.5 py-3 text-sm fade-in shadow-lg shadow-black/10">
            <Icon size={18} className={`flex-shrink-0 mt-px ${TOAST_COLORS[n.type] || TOAST_COLORS.info}`} aria-hidden="true" />
            <span>{n.msg}</span>
          </div>
        )
      })}
    </div>
  )
}

export function InviteCodeBox({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: the code is still visible to copy by hand */ }
  }
  return (
    <div className="flex items-center gap-3 border border-line rounded-card bg-surface px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="eyebrow">Invite code</div>
        <div className="score text-3xl tracking-[0.2em]">{code}</div>
      </div>
      <button className="btn-secondary btn-sm" onClick={copy} aria-label="Copy invite code">
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
