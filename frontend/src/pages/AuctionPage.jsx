import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gavel, Home, Play } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { IPL_TEAMS, getTeam, MAX_TEAMS, STARTING_CREDITS } from '../utils/iplData'
import { TeamChip, Avatar, Modal, Alert, Spinner, PageHeader, SectionHeading, InviteCodeBox } from '../components/UI'

export default function AuctionPage() {
  const { user, refreshUser } = useAuth()
  const { session, selectHomeTeam, placeBid, finalizeAuction, auctionLog, addNotification, fetchSession } = useGame()
  const navigate = useNavigate()
  const [bidAmounts, setBidAmounts] = useState({})
  const [bidError, setBidError] = useState('')
  const [loading, setLoading] = useState('')
  const [showBidModal, setShowBidModal] = useState(false)
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000))
  const prevAuctionRef = useRef(null)

  useEffect(() => {
    if (session?.session?.status === 'active') navigate('/game/dashboard')
    if (!session) navigate('/lobby')
  }, [session, navigate])

  // Refresh the auction state every second; the server's roundEndsAt drives the timer.
  useEffect(() => {
    if (!session?.session?.id || session?.session?.status !== 'auction') return
    const timerId = setInterval(async () => {
      await fetchSession()
      setNowTs(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(timerId)
  }, [session?.session?.id, session?.session?.status, fetchSession])

  // Announce round changes.
  useEffect(() => {
    if (!session?.auction || !session?.players?.length) return
    const currentAuction = session.auction
    const previousAuction = prevAuctionRef.current

    if (!previousAuction) {
      prevAuctionRef.current = { activeTeamId: currentAuction.activeTeamId, status: currentAuction.status }
      return
    }

    if (previousAuction.status !== 'running' && currentAuction.status === 'running' && currentAuction.activeTeamId) {
      addNotification(`Auction started. ${getTeam(currentAuction.activeTeamId).name} is up for ${currentAuction.roundSeconds || 20} seconds.`, 'info')
    }

    if (previousAuction.activeTeamId && previousAuction.activeTeamId !== currentAuction.activeTeamId) {
      // The round ended: close an open bid dialog so it never silently switches to the next team.
      if (!session.pendingBid) { setShowBidModal(false); setBidError('') }
      const endedTeamId = previousAuction.activeTeamId
      const winner = session.players.find(p => p.teams?.some(t => t.teamId === endedTeamId))
      if (winner) {
        addNotification(`${winner.id === user?.id ? 'You' : winner.username} won ${getTeam(endedTeamId).name}`, winner.id === user?.id ? 'success' : 'info')
      } else {
        addNotification(`No bids for ${getTeam(endedTeamId).name}. Next team.`, 'warning')
      }
    }

    if (previousAuction.status !== 'completed' && currentAuction.status === 'completed') {
      const receiver = session.players.find(p => p.teams?.some(t => t.autoAssigned))
      if (receiver) {
        const n = receiver.teams.filter(t => t.autoAssigned).length
        addNotification(`A squad is full, so the last ${n} team${n === 1 ? '' : 's'} went to ${receiver.id === user?.id ? 'you' : receiver.username} at base price`, 'info')
      } else {
        addNotification('Auction complete. Start the season when you are ready.', 'success')
      }
    }

    prevAuctionRef.current = { activeTeamId: currentAuction.activeTeamId, status: currentAuction.status }
  }, [session?.auction, session?.players, addNotification, user?.id])

  if (!session) return null

  const myPlayer = session.players?.find(p => p.id === user?.id)
  const opponent = session.players?.find(p => p.id !== user?.id)
  const pendingBid = session.pendingBid
  const auction = session.auction || null
  const activeTeamId = auction?.activeTeamId || null
  const roundSeconds = auction?.roundSeconds || 20
  const roundEndsAt = auction?.roundEndsAt || null
  const secondsLeft = roundEndsAt ? Math.max(0, roundEndsAt - nowTs) : 0
  const bidTeamId = pendingBid || activeTeamId

  const myTeamIds = myPlayer?.teams?.map(t => t.teamId) || []
  const opponentTeamIds = opponent?.teams?.map(t => t.teamId) || []
  const myCredits = myPlayer?.credits ?? STARTING_CREDITS
  const squadFull = myTeamIds.length >= MAX_TEAMS

  const bothPlayersReady = session.players?.length === 2
  const auctionComplete = auction?.status === 'completed' || (myPlayer?.teams?.length >= MAX_TEAMS && (opponent?.teams?.length >= MAX_TEAMS))
  const isRunning = !pendingBid && auction?.status === 'running' && !!activeTeamId
  // Set when one squad filled up first and the server handed the rest out at base price.
  const autoReceiver = session.players?.find(p => p.teams?.some(t => t.autoAssigned))
  const autoTeams = autoReceiver?.teams?.filter(t => t.autoAssigned) || []
  const fullPlayer = autoReceiver && session.players?.find(p => p.id !== autoReceiver.id)

  const title = !bothPlayersReady ? 'Waiting for your opponent'
    : auctionComplete ? 'Auction complete'
    : !myPlayer?.homeTeam ? 'Pick your home team'
    : pendingBid ? 'Bidding war'
    : 'Auction'

  const handleHomeTeam = async (teamId) => {
    setLoading(`home_${teamId}`)
    try {
      const result = await selectHomeTeam(session.session.id, teamId)
      await refreshUser()
      if (result.conflict) {
        setShowBidModal(true)
        addNotification(`You both want ${getTeam(teamId).name}. Place a bid.`, 'warning')
      } else {
        addNotification(`${getTeam(teamId).name} is your home team`, 'success')
      }
    } catch (err) {
      addNotification(err.response?.data?.error || "Couldn't pick that home team", 'danger')
    } finally { setLoading('') }
  }

  const handleBid = async () => {
    setBidError('')
    if (!bidTeamId) { setBidError('No team is up for bidding right now.'); return }
    const amount = parseInt(bidAmounts[bidTeamId] || 0)
    if (!amount || amount < 1) { setBidError('Enter a whole number of credits.'); return }
    if (amount > myCredits) { setBidError(`You only have ${myCredits} credits.`); return }
    setLoading('bid')
    try {
      const result = await placeBid(session.session.id, bidTeamId, amount)
      await refreshUser()
      if (pendingBid && result.resolved) {
        if (result.resolved.tie) {
          addNotification('Same bid from both of you. Bid again.', 'warning')
        } else {
          addNotification(`${result.resolved.winnerName} won the bid for ${result.resolved.amount} credits`, 'success')
          setShowBidModal(false)
          setBidAmounts({})
        }
      } else {
        addNotification(`Bid of ${amount} placed`, 'info')
        setShowBidModal(false)
      }
    } catch (err) {
      setBidError(err.response?.data?.error || "Your bid didn't go through.")
    } finally { setLoading('') }
  }

  const handleFinalize = async () => {
    setLoading('finalize')
    try {
      await finalizeAuction(session.session.id)
      navigate('/game/dashboard')
    } catch (err) {
      addNotification(err.response?.data?.error || "Couldn't start the season", 'danger')
    } finally { setLoading('') }
  }

  const quickBids = bidTeamId
    ? [...new Set([getTeam(bidTeamId).basePrice, getTeam(bidTeamId).basePrice + 5, getTeam(bidTeamId).basePrice + 10, myCredits])]
        .filter(v => v >= 1 && v <= myCredits)
    : []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 fade-in">
      <PageHeader
        eyebrow={`Game ${session.session.inviteCode} · auction`}
        title={title}
        actions={auctionComplete && (
          <button className="btn-primary py-3 px-5" onClick={handleFinalize} disabled={loading === 'finalize'}>
            {loading === 'finalize' ? <Spinner size="sm" label="Starting season" /> : <><Play size={18} aria-hidden="true" />Start the season</>}
          </button>
        )}
      >
        {!bothPlayersReady
          ? 'Send your opponent the code below. The auction starts when they join.'
          : auctionComplete
            ? 'Bidding is over. Either of you can start the season.'
          : !myPlayer?.homeTeam
            ? 'Pick one team for free before the bidding starts. First come, first served: a team your opponent already took is off the table.'
            : `Teams come up one at a time for ${roundSeconds} seconds. Both of you bid in secret; the highest bid wins.`}
      </PageHeader>

      {!bothPlayersReady && <div className="max-w-md mb-8"><InviteCodeBox code={session.session.inviteCode} /></div>}

      {autoTeams.length > 0 && (
        <Alert type="info" className="mb-8">
          <div className="font-medium">
            {fullPlayer?.id === user?.id ? 'Your' : `${fullPlayer?.username}'s`} squad filled up first, so bidding ended early.
          </div>
          <p className="text-ink-2 mt-1">
            The remaining {autoTeams.length === 1 ? 'team went' : `${autoTeams.length} teams went`} to {autoReceiver.id === user?.id ? 'you' : autoReceiver.username} at base price:{' '}
            {autoTeams.map(t => `${getTeam(t.teamId).short} (${t.pricePaid})`).join(', ')}.
          </p>
        </Alert>
      )}

      {/* On the block */}
      {pendingBid && (
        <section className="card border-accent/50 p-5 mb-8 flex flex-wrap items-center gap-5" aria-label="Bidding war">
          <TeamChip teamId={pendingBid} size="lg" />
          <div className="flex-1 min-w-[12rem]">
            <div className="eyebrow text-accent">Bidding war</div>
            <div className="display text-2xl">{getTeam(pendingBid).name}</div>
            <p className="text-sm text-ink-2">You both picked it as your home team. The higher bid gets it.</p>
          </div>
          <button className="btn-primary py-3 px-5" onClick={() => setShowBidModal(true)}>
            <Gavel size={18} aria-hidden="true" />Place bid
          </button>
        </section>
      )}

      {isRunning && (
        <section className="card p-5 mb-8" aria-label="Team up for auction">
          <div className="flex flex-wrap items-center gap-5">
            <TeamChip teamId={activeTeamId} size="lg" />
            <div className="flex-1 min-w-[12rem]">
              <div className="flex items-center gap-2 eyebrow">
                <span className="live-dot w-2 h-2 rounded-full bg-accent" aria-hidden="true" />On the block
              </div>
              <div className="display text-2xl">{getTeam(activeTeamId).name}</div>
              <p className="text-sm text-ink-2">Base price {getTeam(activeTeamId).basePrice} credits</p>
            </div>
            <div className="text-right">
              <div className="eyebrow">Time left</div>
              <div className={`score text-5xl ${secondsLeft <= 5 ? 'text-accent' : ''}`} aria-live="off">{secondsLeft}<span className="text-2xl text-muted">s</span></div>
            </div>
            <button className="btn-primary py-3 px-5 w-full sm:w-auto" onClick={() => setShowBidModal(true)} disabled={squadFull}>
              <Gavel size={18} aria-hidden="true" />{squadFull ? 'Your squad is full' : 'Place bid'}
            </button>
          </div>
          <div className="h-1 bg-inset rounded-full mt-5 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${(secondsLeft / roundSeconds) * 100}%` }} />
          </div>
        </section>
      )}

      {/* Managers */}
      <div className="grid md:grid-cols-2 gap-4 mb-10">
        {[myPlayer, opponent].map((p, idx) => {
          if (!p) return (
            <div key={idx} className="card p-5 border-dashed flex items-center justify-center text-muted min-h-[9rem]">Waiting for opponent…</div>
          )
          const isMe = p.id === user?.id
          const credits = p.credits ?? STARTING_CREDITS
          return (
            <section key={p.id} className="card p-5" aria-label={isMe ? 'Your squad' : `${p.username}'s squad`}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={p.username} highlight={isMe} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.username}</div>
                    <div className="eyebrow">{isMe ? 'You' : 'Opponent'} · {p.teams?.length || 0} of {MAX_TEAMS} teams</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="score text-3xl">{credits}</div>
                  <div className="eyebrow">credits left</div>
                </div>
              </div>
              <ul className="flex flex-wrap gap-2" aria-label="Teams">
                {(p.teams || []).map(t => (
                  <li key={t.teamId} className="flex items-center gap-1">
                    <TeamChip teamId={t.teamId} />
                    {t.isHome && <Home size={14} className="text-muted" aria-label="Home team" />}
                  </li>
                ))}
                {Array(Math.max(0, MAX_TEAMS - (p.teams?.length || 0))).fill(0).map((_, i) => (
                  <li key={`empty-${i}`} className="h-8 w-12 rounded border border-dashed border-line" aria-hidden="true" />
                ))}
              </ul>
              <div className="h-1 bg-inset rounded-full mt-4 overflow-hidden" aria-hidden="true">
                <div className="h-full bg-ink-2 transition-all duration-500" style={{ width: `${(credits / STARTING_CREDITS) * 100}%` }} />
              </div>
            </section>
          )
        })}
      </div>

      {/* Teams */}
      <SectionHeading aside={`${IPL_TEAMS.filter(t => !myTeamIds.includes(t.id) && !opponentTeamIds.includes(t.id)).length} unsold`}>All teams</SectionHeading>
      <ul className="card divide-rows mb-10">
        {IPL_TEAMS.map(team => {
          const ownedByMe = myTeamIds.includes(team.id)
          const ownedByOpp = opponentTeamIds.includes(team.id)
          const isActive = team.id === activeTeamId && isRunning
          const isLoading = loading === `home_${team.id}`
          return (
            <li key={team.id} className={`flex items-center gap-3 px-4 py-2.5 ${isActive ? 'bg-accent/5' : ''}`}>
              <TeamChip teamId={team.id} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{team.name}</div>
                <div className="eyebrow">Base {team.basePrice} credits</div>
              </div>
              {ownedByMe ? <span className="tag-win">Yours</span>
                : ownedByOpp ? <span className="tag-neutral">{opponent?.username}</span>
                : isLoading ? <Spinner size="sm" />
                : bothPlayersReady && !myPlayer?.homeTeam && !pendingBid ? (
                  <button className="btn-secondary btn-sm" onClick={() => handleHomeTeam(team.id)}>
                    <Home size={14} aria-hidden="true" />Pick as home
                  </button>
                )
                : isActive ? <span className="tag-accent">On the block</span>
                : <span className="text-xs text-muted">Waiting</span>}
            </li>
          )
        })}
      </ul>

      {auctionLog.length > 0 && (
        <section aria-labelledby="log-heading">
          <SectionHeading id="log-heading">Auction log</SectionHeading>
          <ol className="card divide-rows max-h-56 overflow-y-auto text-sm">
            {auctionLog.map((log, i) => (
              <li key={i} className="flex gap-3 px-4 py-2">
                <span className="score text-muted w-6 text-right">{auctionLog.length - i}</span>
                <span className="text-ink-2">{log}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Modal open={showBidModal && !!bidTeamId} onClose={() => setShowBidModal(false)} title={`Bid for ${getTeam(bidTeamId || '').short}`}>
        {bidTeamId && (
          <form onSubmit={e => { e.preventDefault(); handleBid() }}>
            <div className="flex items-center gap-4 mb-5">
              <TeamChip teamId={bidTeamId} size="lg" />
              <div className="text-sm">
                <div className="font-medium text-base">{getTeam(bidTeamId).name}</div>
                <div className="text-ink-2">Base {getTeam(bidTeamId).basePrice} · you have {myCredits} credits</div>
                {!pendingBid && roundEndsAt && <div className="text-accent">{secondsLeft} seconds left</div>}
              </div>
            </div>

            {bidError && <Alert type="danger" className="mb-4">{bidError}</Alert>}

            <label className="label" htmlFor="bid-amount">Your bid (credits)</label>
            <input
              id="bid-amount"
              className="input score text-3xl"
              type="number"
              inputMode="numeric"
              min={1}
              max={myCredits}
              value={bidAmounts[bidTeamId] || ''}
              onChange={e => setBidAmounts(p => ({ ...p, [bidTeamId]: e.target.value }))}
              autoFocus
            />
            <div className="flex flex-wrap gap-2 mt-2" aria-label="Quick amounts">
              {quickBids.map(v => (
                <button type="button" key={v} className="btn-secondary btn-sm score" onClick={() => setBidAmounts(p => ({ ...p, [bidTeamId]: String(v) }))}>
                  {v === myCredits ? `All ${v}` : v}
                </button>
              ))}
            </div>

            <p className="text-sm text-ink-2 my-5">Your opponent can't see your bid. Highest bid when the timer ends wins; you only pay if you win.</p>

            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1 py-3" onClick={() => setShowBidModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1 py-3" disabled={loading === 'bid'}>
                {loading === 'bid' ? <Spinner size="sm" label="Placing bid" /> : 'Place bid'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
