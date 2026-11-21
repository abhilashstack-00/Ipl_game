import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { GameProvider, useGame } from './context/GameContext'
import { ThemeProvider } from './context/ThemeContext'
import Header from './components/Header'
import ServerGate from './components/ServerGate'
import { Spinner, ToastContainer } from './components/UI'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import LobbyPage from './pages/LobbyPage'
import AuctionPage from './pages/AuctionPage'
import DashboardPage from './pages/DashboardPage'
import MatchesPage from './pages/MatchesPage'
import HeadToHeadPage from './pages/HeadToHeadPage'
import AdminPage from './pages/AdminPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted">
      <Spinner size="lg" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppContent() {
  const { user } = useAuth()
  const { notifications } = useGame()
  return (
    <>
      {user && <Header />}
      <main id="main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
          <Route path="/auction" element={<ProtectedRoute><AuctionPage /></ProtectedRoute>} />
          <Route path="/game/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/game/matches" element={<ProtectedRoute><MatchesPage /></ProtectedRoute>} />
          <Route path="/game/h2h" element={<ProtectedRoute><HeadToHeadPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          {/* Old links from before the redesign */}
          <Route path="/game/squads" element={<Navigate to="/game/h2h" replace />} />
          <Route path="/game/leaderboard" element={<Navigate to="/game/h2h" replace />} />
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
    <ThemeProvider>
      <ServerGate>
        <HashRouter>
          <AuthProvider>
            <GameProvider>
              <AppContent />
            </GameProvider>
          </AuthProvider>
        </HashRouter>
      </ServerGate>
    </ThemeProvider>
  )
}
