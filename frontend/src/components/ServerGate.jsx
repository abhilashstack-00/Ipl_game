import React, { useEffect, useState } from 'react'
import { api } from '../utils/api'
import { Spinner } from './UI'
import { Wordmark, ThemeToggle } from './Header'

// Render's free tier puts the backend to sleep when nobody is playing; the first request then
// takes 30-60 s. Wait for /api/health before loading the app, and explain the wait if it's slow.
// This also stops a slow cold start from looking like an expired login.
const SHOW_AFTER_MS = 1500
const GIVE_UP_HINT_S = 90

export default function ServerGate({ children }) {
  const [state, setState] = useState('checking') // checking | waking | ready
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let cancelled = false
    const start = Date.now()
    const slow = setTimeout(() => { if (!cancelled) setState(s => (s === 'checking' ? 'waking' : s)) }, SHOW_AFTER_MS)
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000)

    const ping = async () => {
      while (!cancelled) {
        try {
          await api.get('/health', { timeout: 20000 })
          if (!cancelled) setState('ready')
          return
        } catch {
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }
    ping().finally(() => clearInterval(tick))

    return () => { cancelled = true; clearTimeout(slow); clearInterval(tick) }
  }, [])

  if (state === 'ready') return children
  if (state === 'checking') return null

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-end p-3"><ThemeToggle /></div>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="max-w-sm text-center fade-in">
          <Wordmark className="text-3xl" />
          <div className="flex justify-center my-8 text-accent"><Spinner size="lg" label="Starting the server" /></div>
          <h1 className="font-medium text-lg">Waking up the game server</h1>
          <p className="text-ink-2 text-sm mt-2">
            The free server sleeps when nobody is playing. It usually takes 30 to 60 seconds to start,
            and this page continues on its own.
          </p>
          <div className="score text-2xl mt-6 text-muted" aria-live="off">{elapsed}s</div>
          {elapsed >= GIVE_UP_HINT_S && (
            <div className="mt-6 text-sm">
              <p className="text-ink-2">This is taking longer than usual. Check your connection, or try again.</p>
              <button className="btn-secondary mt-3" onClick={() => window.location.reload()}>Try again</button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
