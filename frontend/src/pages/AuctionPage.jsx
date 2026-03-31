import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { IPL_TEAMS, getTeam, MAX_TEAMS, STARTING_CREDITS } from '../utils/iplData'
import { TeamBadge, Modal, Alert, Spinner, SectionTitle, InviteCodeBox } from '../components/UI'

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

  useEffect(() => {
    if (!session?.session?.id || session?.session?.status !== 'auction') return

    const timerId = setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000))
      fetchSession()
    }, 1000)

    return () => clearInterval(timerId)
  }, [session?.session?.id, session?.session?.status, fetchSession])

  useEffect(() => {
    if (!session?.auction || !session?.players?.length) return

    const currentAuction = session.auction
    const previousAuction = prevAuctionRef.current

    if (!previousAuction) {
      prevAuctionRef.current = {
        activeTeamId: currentAuction.activeTeamId,
        status: currentAuction.status,
      }
      return
    }

    if (previousAuction.status !== 'running' && currentAuction.status === 'running' && currentAuction.activeTeamId) {
      addNotification(`🎯 Auction started: ${getTeam(currentAuction.activeTeamId).name} is live for ${currentAuction.roundSeconds || 20}s`, 'info')
    }

    if (previousAuction.activeTeamId && previousAuction.activeTeamId !== currentAuction.activeTeamId) {
      const endedTeamId = previousAuction.activeTeamId
      const winner = session.players.find(p => p.teams?.some(t => t.teamId === endedTeamId))

      if (winner) {
        addNotification(`🔨 ${winner.username} won ${getTeam(endedTeamId).name}`, winner.id === user?.id ? 'success' : 'info')
      } else {
        addNotification(`⏱️ No bids for ${getTeam(endedTeamId).name}. Moving to next team.`, 'warning')
      }

      if (currentAuction.activeTeamId) {
        addNotification(`🎯 Next up: ${getTeam(currentAuction.activeTeamId).name} (${currentAuction.roundSeconds || 20}s round)`, 'info')
      }
    }

    if (previousAuction.status !== 'completed' && currentAuction.status === 'completed') {
      addNotification('✅ All auction rounds completed. Finalize to start the season.', 'success')
    }

    prevAuctionRef.current = {
      activeTeamId: currentAuction.activeTeamId,
      status: currentAuction.status,
    }
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

  const bothPlayersReady = session.players?.length === 2
  const auctionComplete = auction?.status === 'completed' || (myPlayer?.teams?.length >= MAX_TEAMS && (opponent?.teams?.length >= MAX_TEAMS))

  const handleHomeTeam = async (teamId) => {
    setLoading(`home_${teamId}`)
    try {
      const result = await selectHomeTeam(session.session.id, teamId)
      await refreshUser()
      if (result.conflict) {
        setShowBidModal(true)
        addNotification(`⚔️ Both managers want ${getTeam(teamId).name}! Bidding war!`, 'warning')
      } else {
        addNotification(`🏠 ${getTeam(teamId).name} is your home team (free)!`, 'success')
      }
    } catch (err) {
      addNotification(err.response?.data?.error || 'Failed to select home team', 'danger')
    } finally { setLoading('') }
  }

  const handleBid = async () => {
    setBidError('')
    if (!bidTeamId) { setBidError('No active team to bid on right now'); return }
    const amount = parseInt(bidAmounts[bidTeamId] || 0)
    if (!amount || amount < 1) { setBidError('Enter a valid bid amount'); return }
    if (amount > myCredits) { setBidError(`You only have ${myCredits} cr`); return }
    setLoading('bid')
    try {
      const result = await placeBid(session.session.id, bidTeamId, amount)
      await refreshUser()
      if (pendingBid && result.resolved) {
        if (result.resolved.tie) {
          addNotification('Tie bid! Both players must re-bid.', 'warning')
        } else {
          addNotification(`🔨 ${result.resolved.winnerName} won the bid for ${result.resolved.amount} cr!`, 'success')
          setShowBidModal(false)
          setBidAmounts({})
        }
      } else {
        addNotification(`Bid submitted for this ${roundSeconds}-second round.`, 'info')
        setShowBidModal(false)
      }
    } catch (err) {
      setBidError(err.response?.data?.error || 'Bid failed')
    } finally { setLoading('') }
  }

  const handleFinalize = async () => {
    setLoading('finalize')
    try {
      await finalizeAuction(session.session.id)
      navigate('/game/dashboard')
    } catch (err) {
      addNotification(err.response?.data?.error || 'Failed to finalize', 'danger')
    } finally { setLoading('') }
  }

  return (
    <div className="min-h-screen bg-cricket-pattern px-4 py-8" style={{ background: '#0A1628' }}>
      <div className="max-w-6xl mx-auto animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <SectionTitle className="text-3xl">🔨 Team Auction</SectionTitle>
            <p className="text-gray-400 text-sm mt-1">Pick home teams first, then one team is auctioned every {roundSeconds} seconds for both managers.</p>
          </div>
          {auctionComplete && (
            <button className="btn-gold px-6 py-3 text-base" onClick={handleFinalize} disabled={loading === 'finalize'}>
              {loading === 'finalize' ? <Spinner size="sm" /> : '🚀 Finalize & Start Season →'}
            </button>
          )}
        </div>

        {/* Waiting for opponent */}
        {!bothPlayersReady && (
          <div className="mb-6">
            <Alert type="warning">
              ⏳ Waiting for your opponent to join. Share the invite code below:
            </Alert>
            <div className="mt-3">
              <InviteCodeBox code={session.session.inviteCode} />
            </div>
          </div>
        )}

        {/* Bidding war banner */}
        {pendingBid && (
          <div
            className="mb-6 rounded-2xl p-5 border-2 border-orange-400/60"
            style={{ background: 'rgba(255,107,53,0.08)', boxShadow: '0 0 20px rgba(255,107,53,0.15)' }}
          >
            <div className="flex items-center gap-4 flex-wrap">
              <TeamBadge teamId={pendingBid} size="lg" />
              <div className="flex-1">
                <div className="font-teko text-orange-400 text-3xl uppercase tracking-wider">⚔️ Bidding War!</div>
                <div className="text-gray-300 text-sm">Both managers want <strong className="text-white">{getTeam(pendingBid).name}</strong>. Highest bid wins!</div>
              </div>
              <button className="btn-danger px-6 py-3" onClick={() => setShowBidModal(true)}>
                Place Bid
              </button>
            </div>
          </div>
        )}

        {!pendingBid && auction?.status === 'running' && activeTeamId && (
          <div
            className="mb-6 rounded-2xl p-5 border-2 border-yellow-400/50"
            style={{ background: 'rgba(255,215,0,0.06)', boxShadow: '0 0 20px rgba(255,215,0,0.12)' }}
          >
            <div className="flex items-center gap-4 flex-wrap">
              <TeamBadge teamId={activeTeamId} size="lg" />
              <div className="flex-1">
                <div className="font-teko text-yellow-400 text-3xl uppercase tracking-wider">Active Team: {getTeam(activeTeamId).short}</div>
                <div className="text-gray-300 text-sm">{getTeam(activeTeamId).name} is live now. Both managers can submit bids before time ends.</div>
              </div>
              <div className="text-right">
                <div className="text-gray-400 text-xs uppercase tracking-wider">Round Timer</div>
                <div className="font-teko text-4xl text-white leading-none">{secondsLeft}s</div>
                <button className="btn-danger px-6 py-2 mt-2" onClick={() => setShowBidModal(true)}>
                  Place Bid
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Squad status */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {[myPlayer, opponent].map((p, idx) => {
            if (!p) return (
              <div key={idx} className="card p-5 opacity-40">
                <div className="text-gray-500 text-center py-4">Waiting for opponent...</div>
              </div>
            )
            const isMe = p.id === user?.id
            return (
              <div key={p.id} className={`card p-5 ${isMe ? 'border-yellow-400/50' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-teko font-bold text-lg"
                      style={{ background: isMe ? 'linear-gradient(135deg,#FFD700,#FF6B35)' : 'rgba(255,255,255,0.1)', color: isMe ? '#0A1628' : '#fff' }}
                    >
                      {p.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{p.username}</div>
                      {isMe && <div className="text-yellow-400 text-xs">YOU</div>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="badge badge-blue">💰 {p.credits ?? myCredits}cr</span>
                    <span className="badge badge-gold">{p.teams?.length || 0}/{MAX_TEAMS}</span>
                  </div>
                </div>

                {/* Team slots */}
                <div className="flex flex-wrap gap-2">
                  {(p.teams || []).map(t => (
                    <div key={t.teamId} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold" style={{ background: `${getTeam(t.teamId).bg}`, border: `1px solid ${getTeam(t.teamId).color}50` }}>
                      <TeamBadge teamId={t.teamId} size="sm" />
                      <span style={{ color: getTeam(t.teamId).color }}>{getTeam(t.teamId).short}</span>
                      {t.isHome && <span className="text-yellow-400">🏠</span>}
                    </div>
                  ))}
                  {Array(MAX_TEAMS - (p.teams?.length || 0)).fill(0).map((_, i) => (
                    <div key={i} className="w-10 h-10 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-gray-600 text-lg">?</div>
                  ))}
                </div>

                {/* Budget bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Budget used</span>
                    <span>{STARTING_CREDITS - (p.credits ?? myCredits)} / {STARTING_CREDITS} cr</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-500"
                      style={{ width: `${((STARTING_CREDITS - (p.credits ?? myCredits)) / STARTING_CREDITS) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Teams grid */}
        <SectionTitle className="text-xl mb-4">Available Teams</SectionTitle>

        {!myPlayer?.homeTeam && (
          <Alert type="info" className="mb-4">
            🏠 <strong>Select your Home Team first</strong> before auction starts. If both select the same team, a bidding war resolves it.
          </Alert>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {IPL_TEAMS.map(team => {
            const ownedByMe = myTeamIds.includes(team.id)
            const ownedByOpp = opponentTeamIds.includes(team.id)
            const owned = ownedByMe || ownedByOpp
            const ownerName = ownedByOpp ? opponent?.username : ''
            const squadFull = myTeamIds.length >= MAX_TEAMS
            const isLoading = loading === `home_${team.id}`
            const isActiveRoundTeam = team.id === activeTeamId

            return (
              <div
                key={team.id}
                className={`rounded-xl p-3 border transition-all duration-200 ${!owned ? 'hover:-translate-y-1' : 'opacity-60'}`}
                style={{
                  background: owned ? 'rgba(255,255,255,0.03)' : `${team.bg}33`,
                  borderColor: ownedByMe ? team.color + 'aa' : owned ? 'rgba(255,255,255,0.08)' : team.color + '40',
                }}
              >
                <div className="flex flex-col items-center gap-2 mb-3">
                  <TeamBadge teamId={team.id} size="md" />
                  <div className="text-center">
                    <div className="font-bold text-xs leading-tight">{team.name}</div>
                      <div className="font-teko text-yellow-400">{team.basePrice}cr</div>
                  </div>
                </div>

                {owned ? (
                  <div className="text-center">
                    {ownedByMe
                      ? <span className="badge badge-gold text-xs">✓ YOURS</span>
                      : <span className="badge badge-red text-xs">✗ {ownerName}</span>
                    }
                  </div>
                ) : isLoading ? (
                  <div className="flex justify-center"><Spinner size="sm" /></div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {!myPlayer?.homeTeam && (
                      <button
                        className="btn-outline py-1 px-2 text-xs w-full"
                        onClick={() => handleHomeTeam(team.id)}
                        disabled={squadFull}
                      >
                        🏠 Free
                      </button>
                    )}
                    {myPlayer?.homeTeam && (
                      <button
                        className={`${isActiveRoundTeam && !pendingBid ? 'btn-danger' : 'btn-outline'} py-1 px-2 text-xs w-full`}
                        onClick={() => setShowBidModal(true)}
                        disabled={!isActiveRoundTeam || !!pendingBid || squadFull || auction?.status !== 'running'}
                        title={isActiveRoundTeam ? 'Bid for active team' : 'Waiting for this team\'s turn'}
                      >
                        {isActiveRoundTeam ? '🔨 Bid Now' : 'Waiting Turn'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Auction log */}
        {auctionLog.length > 0 && (
          <div className="mt-8">
            <SectionTitle className="text-lg mb-3">📋 Auction Log</SectionTitle>
            <div className="card p-4 max-h-48 overflow-y-auto">
              {auctionLog.map((log, i) => (
                <div key={i} className="py-1.5 border-b border-white/5 text-sm text-gray-400 last:border-0">
                  <span className="text-yellow-400 mr-2 font-teko">{auctionLog.length - i}.</span>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bid modal */}
      <Modal open={showBidModal && !!bidTeamId} onClose={() => setShowBidModal(false)} title={`⚔️ Bid for ${getTeam(bidTeamId || '')?.name}`}>
        {bidTeamId && (
          <div>
            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-white/5">
              <TeamBadge teamId={bidTeamId} size="lg" />
              <div>
                <div className="font-bold text-lg">{getTeam(bidTeamId).name}</div>
                <div className="text-gray-400 text-sm">Base price: {getTeam(bidTeamId).basePrice} cr</div>
                <div className="text-yellow-400 text-sm">Your budget: {myCredits} cr</div>
                {!pendingBid && roundEndsAt && <div className="text-orange-400 text-sm">Time left: {secondsLeft}s</div>}
              </div>
            </div>

            {bidError && <Alert type="danger" className="mb-4">{bidError}</Alert>}

            <div className="mb-4">
              <label className="block text-gray-400 text-xs uppercase tracking-widest mb-2">Your Bid (cr)</label>
              <input
                className="input-field text-2xl font-teko"
                type="number"
                min={1}
                max={myCredits}
                placeholder={`Min: 1, Max: ${myCredits}`}
                value={bidAmounts[bidTeamId] || ''}
                onChange={e => setBidAmounts(p => ({ ...p, [bidTeamId]: e.target.value }))}
              />
            </div>

            <Alert type="info" className="mb-5">
              Both managers bid simultaneously for the active team. Highest bid at timer end wins.
            </Alert>

            <div className="flex gap-3">
              <button className="btn-outline flex-1 py-3" onClick={() => setShowBidModal(false)}>Cancel</button>
              <button className="btn-danger flex-1 py-3" onClick={handleBid} disabled={loading === 'bid'}>
                {loading === 'bid' ? <Spinner size="sm" /> : '🔨 Submit Bid'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
