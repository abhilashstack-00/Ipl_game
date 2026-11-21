import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { api } from '../utils/api'
import { TeamBadge, Modal, Alert, Spinner, SectionTitle, EmptyState } from '../components/UI'
import { getTeam } from '../utils/iplData'

// Admin-only page (the server enforces the role on every request; the checks here only decide what to show).
// Official results are global, so the admin does not need to be in a game to use this page.

const SOURCE_LABELS = {
  schedule: 'Schedule',
  'live-feed': 'Live feed',
  admin: 'Admin',
}

function ago(ts) {
  if (!ts) return 'never'
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`
  return `${Math.round(secs / 86400)} days ago`
}

function outcomeText(match) {
  if (!match.outcome) return ''
  if (match.outcome.isDraw) return 'Draw / no result'
  return `${getTeam(match.outcome.winnerTeamId).short} won`
}

function LiveFeedStatus({ live }) {
  if (!live) return null
  if (!live.enabled) {
    return (
      <Alert type="warning">
        <strong>Live feed is off.</strong> Results only come from the built-in schedule and from you, so every played match will show up under "Needs a result".
      </Alert>
    )
  }
  if (live.lastError) {
    return (
      <Alert type="danger">
        <strong>Live feed error:</strong> {live.lastError}. Last successful update: {ago(live.lastSuccessTs)}. Until it recovers, enter results for finished matches below.
      </Alert>
    )
  }
  if (live.lastSuccessTs) {
    return (
      <Alert type="success">
        <strong>Live feed is working.</strong> Last update {ago(live.lastSuccessTs)}. Most results will fill in by themselves; you only need to step in for matches listed under "Needs a result".
      </Alert>
    )
  }
  return <Alert type="info">Live feed is on but has not fetched yet. Refresh in a minute.</Alert>
}

function MatchRow({ match, today, children }) {
  return (
    <div className="rounded-xl p-4 border border-white/10 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <TeamBadge teamId={match.team1} size="sm" />
      <div className="flex-1 min-w-[140px]">
        <div className="font-teko text-lg text-gray-200">
          {getTeam(match.team1).short} vs {getTeam(match.team2).short}
          {match.date === today && <span className="badge badge-gold ml-2 align-middle">Today</span>}
        </div>
        <div className="text-xs text-gray-500">{match.date} · {match.venue}</div>
        {match.liveStatus && <div className="text-xs text-cyan-400 mt-0.5">Feed says: {match.liveStatus}</div>}
      </div>
      <TeamBadge teamId={match.team2} size="sm" />
      <div className="flex flex-wrap gap-1.5 justify-end w-full sm:w-auto">{children}</div>
    </div>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  const { adminSetMatchResult, addNotification } = useGame()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pending, setPending] = useState(null) // { match, winnerTeamId, isDraw }
  const [saving, setSaving] = useState(false)
  const [showAllDecided, setShowAllDecided] = useState(false)
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)

  const isAdmin = user?.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const r = await api.get('/game/admin/matches')
      setData(r.data)
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Could not load matches. The server may be waking up; try again in a minute.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  if (!isAdmin) {
    return (
      <div className="px-4 py-10">
        <EmptyState icon="🔒" title="Admin only" subtitle="This page is for the site admin." />
      </div>
    )
  }

  const confirmResult = async () => {
    if (!pending) return
    setSaving(true)
    try {
      await adminSetMatchResult(pending.match.id, pending.winnerTeamId, pending.isDraw)
      addNotification('Official result recorded', 'success')
      setPending(null)
      await load()
    } catch (err) {
      addNotification(err.response?.data?.error || 'Failed to record result', 'danger')
    } finally {
      setSaving(false)
    }
  }

  const matches = data?.matches || []
  const today = data?.today
  const needsResult = matches.filter(m => m.status === 'needs-result')
  const decided = matches.filter(m => m.status === 'decided').reverse() // newest first
  const upcoming = matches.filter(m => m.status === 'upcoming')
  const decidedShown = showAllDecided ? decided : decided.slice(0, 8)
  const upcomingShown = showAllUpcoming ? upcoming : upcoming.slice(0, 5)

  return (
    <div className="min-h-screen w-full px-3 sm:px-4 py-6 sm:py-8 animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <SectionTitle className="text-3xl">🛡️ Admin: Match Results</SectionTitle>
            <p className="text-gray-400 text-sm mt-1">
              Results you enter here count for every game on the site. You do not need to be in a game.
            </p>
          </div>
          <button className="btn-outline py-1.5 px-4 text-xs" onClick={load} disabled={loading} aria-label="Refresh match list">
            {loading ? <Spinner size="sm" /> : '↻ Refresh'}
          </button>
        </div>

        {loadError && <Alert type="danger">{loadError}</Alert>}
        {data && <LiveFeedStatus live={data.live} />}

        {loading && !data ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : data && (
          <>
            {/* Needs a result */}
            <section aria-labelledby="needs-result-heading">
              <h3 id="needs-result-heading" className="font-teko text-orange-400 text-2xl uppercase tracking-wider mb-3">
                Needs a result ({needsResult.length})
              </h3>
              {needsResult.length === 0 ? (
                <p className="text-gray-500 text-sm">Nothing to do. Every played match has a result.</p>
              ) : (
                <div className="space-y-2">
                  {needsResult.map(match => (
                    <MatchRow key={match.id} match={match} today={today}>
                      <button
                        className="btn-gold py-1.5 px-3 text-xs"
                        onClick={() => setPending({ match, winnerTeamId: match.team1, isDraw: false })}
                        aria-label={`Record ${getTeam(match.team1).name} as the winner`}
                      >
                        {getTeam(match.team1).short} won
                      </button>
                      <button
                        className="btn-outline py-1.5 px-3 text-xs"
                        onClick={() => setPending({ match, winnerTeamId: null, isDraw: true })}
                        aria-label="Record a draw or no result"
                      >
                        Draw / No result
                      </button>
                      <button
                        className="btn-gold py-1.5 px-3 text-xs"
                        onClick={() => setPending({ match, winnerTeamId: match.team2, isDraw: false })}
                        aria-label={`Record ${getTeam(match.team2).name} as the winner`}
                      >
                        {getTeam(match.team2).short} won
                      </button>
                    </MatchRow>
                  ))}
                </div>
              )}
            </section>

            {/* Already decided */}
            <section aria-labelledby="decided-heading">
              <h3 id="decided-heading" className="font-teko text-green-400 text-2xl uppercase tracking-wider mb-3">
                Already decided ({decided.length})
              </h3>
              {decided.length === 0 ? (
                <p className="text-gray-500 text-sm">No results yet.</p>
              ) : (
                <div className="space-y-2">
                  {decidedShown.map(match => (
                    <MatchRow key={match.id} match={match} today={today}>
                      <span className="badge badge-green">{outcomeText(match)}</span>
                      <span className="badge badge-blue">
                        {SOURCE_LABELS[match.source] || match.source}
                        {match.source === 'admin' && match.enteredBy ? ` · ${match.enteredBy}` : ''}
                      </span>
                    </MatchRow>
                  ))}
                  {decided.length > decidedShown.length && (
                    <button className="text-xs text-yellow-400 hover:underline" onClick={() => setShowAllDecided(true)}>
                      Show all {decided.length}
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Upcoming */}
            <section aria-labelledby="upcoming-heading">
              <h3 id="upcoming-heading" className="font-teko text-cyan-400 text-2xl uppercase tracking-wider mb-3">
                Upcoming ({upcoming.length})
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-gray-500 text-sm">No upcoming matches.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingShown.map(match => (
                    <MatchRow key={match.id} match={match} today={today}>
                      <span className="text-xs text-gray-500">Not played yet</span>
                    </MatchRow>
                  ))}
                  {upcoming.length > upcomingShown.length && (
                    <button className="text-xs text-yellow-400 hover:underline" onClick={() => setShowAllUpcoming(true)}>
                      Show all {upcoming.length}
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Confirmation: results cannot be changed through the app once saved */}
      <Modal open={!!pending} onClose={() => !saving && setPending(null)} title="Confirm official result">
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <TeamBadge teamId={pending.match.team1} size="lg" />
              <div className="font-teko text-3xl text-gray-500">VS</div>
              <TeamBadge teamId={pending.match.team2} size="lg" />
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm">{pending.match.date} · {pending.match.venue}</div>
              <div className="font-teko text-3xl text-yellow-400 mt-2">
                {pending.isDraw ? 'Draw / No result' : `${getTeam(pending.winnerTeamId).name} won`}
              </div>
            </div>
            {pending.match.date === today && (
              <Alert type="warning">This match is today. Only save once it has actually finished.</Alert>
            )}
            <Alert type="info">
              This counts for every game on the site and <strong>cannot be changed afterwards</strong>. Check the real result first.
            </Alert>
            <div className="flex gap-3 justify-end">
              <button className="btn-outline py-2 px-4 text-sm" onClick={() => setPending(null)} disabled={saving}>
                Cancel
              </button>
              <button className="btn-gold py-2 px-5 text-sm" onClick={confirmResult} disabled={saving}>
                {saving ? <Spinner size="sm" /> : 'Save result'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
