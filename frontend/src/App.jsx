import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { GameProvider } from './context/GameContext'
import { useGame } from './context/GameContext'
import Header from './components/Header'
import { ToastContainer } from './components/UI'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import LobbyPage from './pages/LobbyPage'
import AuctionPage from './pages/AuctionPage'
import DashboardPage from './pages/DashboardPage'
import MatchesPage from './pages/MatchesPage'
import LeaderboardPage from './pages/LeaderboardPage'
import SquadsPage from './pages/SquadsPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="font-teko text-4xl text-yellow-400 tracking-widest mb-3">IPL STRATEGY</div>
        <div className="w-8 h-8 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppContent() {
  const { notifications } = useGame()
  return (
    <>
      <Header />
      <main className="min-h-screen">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
          <Route path="/auction" element={<ProtectedRoute><AuctionPage /></ProtectedRoute>} />
          <Route path="/game/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/game/matches" element={<ProtectedRoute><MatchesPage /></ProtectedRoute>} />
          <Route path="/game/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
          <Route path="/game/squads" element={<ProtectedRoute><SquadsPage /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/lobby" replace />} />
          <Route path="*" element={<Navigate to="/lobby" replace />} />
        </Routes>
      </main>
      <ToastContainer notifications={notifications || []} />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <GameProvider>
          <AppContent />
        </GameProvider>
      </AuthProvider>
    </HashRouter>
  )
}
