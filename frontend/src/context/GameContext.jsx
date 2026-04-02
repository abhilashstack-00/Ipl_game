import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, getSocket } from '../utils/api'
import { useAuth } from './AuthContext'

const GameContext = createContext(null)
const NOTIFICATION_TTL_MS = 2500
const MAX_NOTIFICATIONS = 3

export function GameProvider({ children }) {
  const { user } = useAuth()
  const [session, setSession] = useState(null)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [auctionLog, setAuctionLog] = useState([])
  const [notifications, setNotifications] = useState([])

  const addNotification = useCallback((msg, type = 'info') => {
    const id = Date.now()
    setNotifications(prev => [...prev.slice(-(MAX_NOTIFICATIONS - 1)), { id, msg, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), NOTIFICATION_TTL_MS)
  }, [])

  const fetchSession = useCallback(async () => {
    if (!user) return
    try {
      const r = await api.get('/game/session')
      setSession(r.data.session)
      return r.data.session
    } catch (err) {
      console.error('Failed to fetch session', err)
    }
  }, [user])

  const fetchMatches = useCallback(async (sessionId) => {
    if (!sessionId) return
    try {
      const r = await api.get(`/game/matches/${sessionId}`)
      setMatches(r.data.matches)
      return r.data.matches
    } catch (err) {
      console.error('Failed to fetch matches', err)
    }
  }, [])

  useEffect(() => {
    if (user) fetchSession()
  }, [user, fetchSession])

  useEffect(() => {
    if (session?.session?.id) {
      fetchMatches(session.session.id)

      // Socket.io setup
      const socket = getSocket()
      if (!socket.connected) socket.connect()

      socket.emit('join-session', {
        sessionId: session.session.id,
        userId: user?.id,
        username: user?.username,
      })

      socket.on('auction-update', (data) => {
        setAuctionLog(prev => [data.message, ...prev.slice(0, 19)])
        addNotification(data.message, data.type === 'bid-war-started' ? 'warning' : 'success')
        fetchSession()
      })

      socket.on('match-result', (data) => {
        addNotification(data.message, 'success')
        fetchSession()
        fetchMatches(session.session.id)
      })

      socket.on('player-joined', (data) => {
        addNotification(`${data.username} joined the game!`, 'info')
        fetchSession()
      })

      socket.on('state-update', () => {
        fetchSession()
        fetchMatches(session.session.id)
      })

      return () => {
        socket.off('auction-update')
        socket.off('match-result')
        socket.off('player-joined')
        socket.off('state-update')
      }
    }
  }, [session?.session?.id, user, addNotification, fetchSession, fetchMatches])

  const createSession = async () => {
    setLoading(true)
    try {
      const r = await api.post('/game/session')
      setSession(r.data.session)
      return r.data.session
    } finally { setLoading(false) }
  }

  const joinSession = async (inviteCode) => {
    setLoading(true)
    try {
      const r = await api.post('/game/session/join', { inviteCode })
      setSession(r.data.session)
      return r.data.session
    } finally { setLoading(false) }
  }

  const leaveSession = async () => {
    setLoading(true)
    try {
      await api.post('/game/session/leave')
      setSession(null)
      setMatches([])
      setAuctionLog([])
      return true
    } finally { setLoading(false) }
  }

  const selectHomeTeam = async (sessionId, teamId) => {
    const r = await api.post('/game/home-team', { sessionId, teamId })
    setSession(r.data.session)
    const socket = getSocket()
    socket.emit('home-team-selected', { sessionId, teamId, userId: user.id, username: user.username, conflict: r.data.conflict })
    return r.data
  }

  const placeBid = async (sessionId, teamId, amount) => {
    const r = await api.post('/game/bid', { sessionId, teamId, amount })
    setSession(r.data.session)
    const socket = getSocket()
    socket.emit('bid-placed', { sessionId, teamId, userId: user.id, username: user.username })
    return r.data
  }

  const chooseMatchTeam = async (sessionId, matchId, chosenTeamId) => {
    const r = await api.post('/game/match-choice', { sessionId, matchId, chosenTeamId })
    setSession(r.data.session)
    await fetchMatches(sessionId)
    return r.data
  }

  const buyTeam = async (sessionId, teamId) => {
    const r = await api.post('/game/buy-team', { sessionId, teamId })
    setSession(r.data.session)
    const socket = getSocket()
    socket.emit('team-bought', { sessionId, teamId, userId: user.id, username: user.username, price: r.data.price })
    return r.data
  }

  const finalizeAuction = async (sessionId) => {
    const r = await api.post('/game/finalize-auction', { sessionId })
    setSession(r.data.session)
    return r.data
  }

  const processMatch = async (sessionId, matchId, winnerTeamId, isDraw = false) => {
    const r = await api.post('/game/process-match', { sessionId, matchId, winnerTeamId, isDraw })
    setSession(r.data.session)
    await fetchMatches(sessionId)
    const socket = getSocket()
    socket.emit('match-processed', { sessionId, matchId, winnerName: '?', points: isDraw ? 1 : 2 })
    return r.data
  }

  return (
    <GameContext.Provider value={{
      session, matches, loading, auctionLog, notifications,
      fetchSession, fetchMatches, createSession, joinSession,
      leaveSession,
      selectHomeTeam, placeBid, buyTeam, finalizeAuction, processMatch,
      chooseMatchTeam,
      addNotification,
    }}>
      {children}
    </GameContext.Provider>
  )
}

export const useGame = () => useContext(GameContext)
