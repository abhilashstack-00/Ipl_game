import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import { Alert, Spinner } from '../components/UI'

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!USERNAME_RE.test(form.username)) { setError('Usernames are 3 to 24 letters, numbers or underscores.'); return }
    if (form.password.length < 8) { setError('Use at least 8 characters for your password.'); return }
    if (form.password !== form.confirm) { setError("The two passwords don't match."); return }
    setLoading(true)
    try {
      const registered = await register(form.username, form.password)
      // An ADMIN_USERNAMES account is admin from the start, so send it straight to the admin page.
      const dest = registered?.role === 'admin' ? '/admin' : '/lobby'
      if (window.location.hostname.endsWith('github.io')) {
        window.location.replace(`${window.location.origin}/Ipl_game/#${dest}`)
      } else {
        navigate(dest)
      }
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create the account. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create an account"
      footer={<>Already have one? <Link to="/login" className="font-medium text-accent hover:underline">Log in</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert type="danger">{error}</Alert>}
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            aria-describedby="username-hint"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
            autoFocus
          />
          <p id="username-hint" className="eyebrow mt-1.5">3 to 24 letters, numbers or underscores. Capitals count.</p>
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            aria-describedby="password-hint"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          />
          <p id="password-hint" className="eyebrow mt-1.5">At least 8 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat password</label>
          <input
            id="confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
          {loading ? <Spinner size="sm" label="Creating account" /> : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
