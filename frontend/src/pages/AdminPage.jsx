import React, { useCallback, useEffect, useState } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { api } from '../utils/api'
import { TeamChip, Modal, Alert, Spinner, PageHeader, SectionHeading, EmptyState } from '../components/UI'
import { getTeam } from '../utils/iplData'
import { formatDate } from '../utils/matches'

// Admin-only page (the server enforces the role on every request; the checks here only decide what to show).
// Official results are global, so the admin does not need to be in a game to use this page.

const SOURCE_LABELS = { schedule: 'Schedule', 'live-feed': 'Live feed', admin: 'Admin' }

function ago(ts) {
  if (!ts) return 'never'
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (secs < 60) return `${secs} s ago`
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`
  return `${Math.round(secs / 86400)} days ago`
}

function outcomeText(match) {
  if (!match.outcome) return ''
  if (match.outcome.isDraw) return 'No result'
  return `${getTeam(match.outcome.winnerTeamId).short} won`
}

function LiveFeedStatus({ live }) {
  if (!live) return null
  if (!live.enabled) {
    return <Alert type="warning"><strong className="font-medium">Live feed is off.</strong> Results only come from the built-in schedule and from you, so every played match appears under "Needs a result".</Alert>
  }
  if (live.lastError) {
    return <Alert type="danger"><strong className="font-medium">Live feed error:</strong> {live.lastError}. Last good update {ago(live.lastSuccessTs)}. Until it recovers, enter results for finished matches below.</Alert>
  }
  if (live.lastSuccessTs) {
    return <Alert type="success"><strong className="font-medium">Live feed is working.</strong> Last update {ago(live.lastSuccessTs)}. Most results fill in on their own; you only need to step in under "Needs a result".</Alert>
  }
  return <Alert type="info">The live feed is on but hasn't fetched yet. Refresh in a minute.</Alert>
}

function Row({ match, today, children }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="text-sm text-muted">{match.date === today ? <span className="tag-accent">Today</span> : formatDate(match.date)}</div>
      <div className="flex items-center gap-2 min-w-0">
        <TeamChip teamId={match.team1} />
        <span className="text-xs text-muted">v</span>
        <TeamChip teamId={match.team2} />
        <span className="text-xs text-muted truncate hidden md:inline ml-1">{match.venue}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:justify-end">{children}</div>
    </li>
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
      setLoadError(err.response?.data?.error || "Couldn't load matches. The server may be waking up; try again in a minute.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  if (!isAdmin) {
    return <EmptyState icon={Lock} title="Admin only">This page is for the site admin.</EmptyState>
  }

  const confirmResult = async () => {
    if (!pending) return
    setSaving(true)
    try {
      await adminSetMatchResult(pending.match.id, pending.winnerTeamId, pending.isDraw)
      addNotification('Official result saved', 'success')
      setPending(null)
      await load()
    } catch (err) {
      addNotification(err.response?.data?.error || "Couldn't save the result", 'danger')
    } finally {
      setSaving(false)
    }
  }

  const matches = data?.matches || []
  const today = data?.today
  const needsResult = matches.filter(m => m.status === 'needs-result')
  const decided = matches.filter(m => m.status === 'decided').reverse()
  const upcoming = matches.filter(m => m.status === 'upcoming')
  const decidedShown = showAllDecided ? decided : decided.slice(0, 8)
  const upcomingShown = showAllUpcoming ? upcoming : upcoming.slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 fade-in">
      <PageHeader
        eyebrow="Admin"
        title="Match results"
        actions={
          <button className="btn-secondary" onClick={load} disabled={loading} aria-label="Refresh match list">
            {loading ? <Spinner size="sm" /> : <RefreshCw size={16} aria-hidden="true" />}Refresh
          </button>
        }
      >
        Results you save here count for every game on the site. You don't need to be in a game.
      </PageHeader>

      <div className="space-y-3 mb-8">
        {loadError && <Alert type="danger">{loadError}</Alert>}
        {data && <LiveFeedStatus live={data.live} />}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16 text-muted"><Spinner size="lg" /></div>
      ) : data && (
        <div className="space-y-10">
          <section aria-labelledby="needs-heading">
            <SectionHeading id="needs-heading" aside={`${needsResult.length} match${needsResult.length === 1 ? '' : 'es'}`}>Needs a result</SectionHeading>
            {needsResult.length === 0 ? (
              <p className="text-sm text-muted">Nothing to do. Every played match has a result.</p>
            ) : (
              <ul className="card divide-rows">
                {needsResult.map(match => (
                  <Row key={match.id} match={match} today={today}>
                    <button className="btn-secondary btn-sm" onClick={() => setPending({ match, winnerTeamId: match.team1, isDraw: false })} aria-label={`Record ${getTeam(match.team1).name} as the winner`}>
                      {getTeam(match.team1).short} won
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setPending({ match, winnerTeamId: null, isDraw: true })} aria-label="Record a tie or no result">
                      No result
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => setPending({ match, winnerTeamId: match.team2, isDraw: false })} aria-label={`Record ${getTeam(match.team2).name} as the winner`}>
                      {getTeam(match.team2).short} won
                    </button>
                  </Row>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="decided-heading">
            <SectionHeading id="decided-heading" aside={`${decided.length}`}>Already decided</SectionHeading>
            {decided.length === 0 ? (
              <p className="text-sm text-muted">No results yet.</p>
            ) : (
              <>
                <ul className="card divide-rows">
                  {decidedShown.map(match => (
                    <Row key={match.id} match={match} today={today}>
                      <span className="tag-win">{outcomeText(match)}</span>
                      <span className="tag-neutral">
                        {SOURCE_LABELS[match.source] || match.source}
                        {match.source === 'admin' && match.enteredBy ? ` · ${match.enteredBy}` : ''}
                      </span>
                    </Row>
                  ))}
                </ul>
                {decided.length > decidedShown.length && (
                  <button className="btn-ghost btn-sm mt-2" onClick={() => setShowAllDecided(true)}>Show all {decided.length}</button>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="upcoming-heading">
            <SectionHeading id="upcoming-heading" aside={`${upcoming.length}`}>Upcoming</SectionHeading>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">No upcoming matches.</p>
            ) : (
              <>
                <ul className="card divide-rows">
                  {upcomingShown.map(match => (
                    <Row key={match.id} match={match} today={today}>
                      <span className="text-xs text-muted">Not played yet</span>
                    </Row>
                  ))}
                </ul>
                {upcoming.length > upcomingShown.length && (
                  <button className="btn-ghost btn-sm mt-2" onClick={() => setShowAllUpcoming(true)}>Show all {upcoming.length}</button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* Confirm first: results can't be changed through the app once saved */}
      <Modal open={!!pending} onClose={() => !saving && setPending(null)} title="Save this result?">
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TeamChip teamId={pending.match.team1} size="lg" />
              <span className="text-muted">v</span>
              <TeamChip teamId={pending.match.team2} size="lg" />
            </div>
            <div>
              <div className="eyebrow">{formatDate(pending.match.date)} · {pending.match.venue}</div>
              <div className="display text-2xl mt-1">
                {pending.isDraw ? 'Tie or no result' : `${getTeam(pending.winnerTeamId).name} won`}
              </div>
            </div>
            {pending.match.date === today && (
              <Alert type="warning">This match is today. Only save once it has finished.</Alert>
            )}
            <Alert type="info">It counts for every game on the site and <strong className="font-medium">can't be changed afterwards</strong>. Check the real result first.</Alert>
            <div className="flex gap-3 justify-end pt-1">
              <button className="btn-secondary" onClick={() => setPending(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={confirmResult} disabled={saving}>
                {saving ? <Spinner size="sm" label="Saving" /> : 'Save result'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
