import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 4) { setError('Password must be at least 4 characters'); return }
    setLoading(true)
    try {
      await register(form.username, form.password)
      if (window.location.hostname.endsWith('github.io')) {
        window.location.replace(`${window.location.origin}/Ipl_game/#/lobby`)
      } else {
        navigate('/lobby')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at 70% 20%, rgba(255,107,53,0.1) 0%, transparent 50%), linear-gradient(135deg, #0A1628 0%, #122040 100%)',
      }}
    >
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="font-teko text-4xl text-yellow-400 tracking-widest">JOIN THE LEAGUE</div>
          <div className="text-gray-500 text-sm mt-1">Create your manager account</div>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(18,32,64,0.9)',
            border: '1px solid rgba(255,215,0,0.25)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}
        >
          <h2 className="font-teko text-yellow-400 text-2xl uppercase tracking-widest mb-6">Create Account</h2>

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
                placeholder="Choose a username (min 3 chars)"
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
                placeholder="Create a password (min 4 chars)"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs uppercase tracking-widest mb-1.5">Confirm Password</label>
              <input
                className="input-field"
                type="password"
                placeholder="Repeat your password"
                value={form.confirm}
                onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              />
            </div>

            <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-3 text-xs text-gray-400">
              <div className="text-yellow-400 font-bold mb-1">📋 Game Rules</div>
              <ul className="space-y-1">
                <li>• Each player starts every game with <strong className="text-white">100 cr</strong></li>
                <li>• Pick up to <strong className="text-white">5 IPL teams</strong> via auction</li>
                <li>• Earn <strong className="text-white">2pts</strong> for wins, <strong className="text-white">1pt</strong> for draws</li>
              </ul>
            </div>

            <button
              type="submit"
              className="btn-gold w-full py-3 text-base"
              disabled={loading}
            >
              {loading ? 'Creating...' : '🚀 Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-gray-500 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-yellow-400 font-bold hover:text-yellow-300">
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
