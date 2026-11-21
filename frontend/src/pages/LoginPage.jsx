import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import { Alert, Spinner } from '../components/UI'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.username || !form.password) { setError('Enter your username and password.'); return }
    setLoading(true)
    try {
      const loggedIn = await login(form.username, form.password)
      // Admins land on the admin page; they don't need to be in a game.
      const dest = loggedIn?.role === 'admin' ? '/admin' : '/lobby'
      if (window.location.hostname.endsWith('github.io')) {
        window.location.replace(`${window.location.origin}/Ipl_game/#${dest}`)
      } else {
        navigate(dest)
      }
    } catch (err) {
      setError(err.response?.data?.error === 'Invalid credentials'
        ? "That username and password don't match. Accounts are reset when the server restarts, so you may need to register again."
        : err.response?.data?.error || "Couldn't log in. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Log in"
      footer={<>New here? <Link to="/register" className="font-medium text-accent hover:underline">Create an account</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert type="danger">{error}</Alert>}
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
          {loading ? <Spinner size="sm" label="Logging in" /> : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  )
}
