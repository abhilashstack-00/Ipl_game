import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/lobby')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at 30% 30%, rgba(255,107,53,0.1) 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(0,229,255,0.08) 0%, transparent 50%), linear-gradient(135deg, #0A1628 0%, #122040 100%)',
      }}
    >
      <div className="w-full max-w-md animate-fade-in">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="font-teko text-6xl font-bold leading-none mb-1">
            <span className="text-yellow-400" style={{ textShadow: '0 0 30px rgba(255,215,0,0.5)' }}>IPL</span>
          </div>
          <div className="font-teko text-3xl text-orange-400 tracking-widest">STRATEGY ARENA</div>
          <div className="text-gray-500 text-sm mt-2 tracking-wider">TWO MANAGERS. TEN TEAMS. ONE CHAMPION.</div>
          <div className="flex justify-center gap-2 mt-4">
            {['🏏','🏆','⚔️','💰'].map(e => (
              <span key={e} className="text-2xl">{e}</span>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(18,32,64,0.9)',
            border: '1px solid rgba(255,215,0,0.25)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 30px rgba(255,215,0,0.05)',
          }}
        >
          <h2 className="font-teko text-yellow-400 text-2xl uppercase tracking-widest mb-6">Enter the Arena</h2>

          {error && (
            <div className="bg-red-500/15 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-xs uppercase tracking-widest mb-1.5">Username</label>
              <input
                className="input-field"
                placeholder="Enter your username"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs uppercase tracking-widest mb-1.5">Password</label>
              <input
                className="input-field"
                type="password"
                placeholder="Enter your password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              className="btn-gold w-full py-3 text-base mt-2"
              disabled={loading}
            >
              {loading ? 'Logging in...' : '🏏 Login & Play'}
            </button>
          </form>

          <div className="mt-6 text-center text-gray-500 text-sm">
            New player?{' '}
            <Link to="/register" className="text-yellow-400 font-bold hover:text-yellow-300">
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
