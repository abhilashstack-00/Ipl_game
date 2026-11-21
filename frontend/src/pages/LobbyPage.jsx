import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGame } from '../context/GameContext'
import { InviteCodeBox, Alert, Spinner, PageHeader, SectionHeading } from '../components/UI'

const STEPS = [
  ['Start a game', 'Create a game and send the invite code to your opponent, or join theirs.'],
  ['Pick a home team', 'Each of you takes one team for free. If you both want the same one, you bid for it.'],
  ['Auction', 'The other teams come up one at a time for 20 seconds. Highest bid wins. 100 credits, five teams each. Once one of you has five, the rest go to the other at base price.'],
  ['Play the season', 'Points come from the real IPL results whenever your teams play theirs.'],
]

export default function LobbyPage() {
  const { user } = useAuth()
  const { session, createSession, joinSession, loading } = useGame()
  const navigate = useNavigate()
  const [inviteInput, setInviteInput] = useState('')
  const [joinError, setJoinError] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const waitingForOpponent = session?.session?.status === 'waiting'

  // Already in a game: go to the right screen.
  React.useEffect(() => {
    if (session) {
      const status = session.session?.status
      if (status === 'active') navigate('/game/dashboard')
      else if (status === 'auction') navigate('/auction')
    }
  }, [session, navigate])

  const handleCreate = async () => {
    setCreateError('')
    setCreating(true)
    try {
      const s = await createSession()
      const status = s?.session?.status
      if (status === 'active') navigate('/game/dashboard')
      else if (status === 'auction') navigate('/auction')
      else if (status !== 'waiting') setCreateError('The game was created but something unexpected happened. Refresh the page.')
    } catch (err) {
      setCreateError(err.response?.data?.error || "Couldn't create a game. Try again.")
    } finally { setCreating(false) }
  }

  const handleJoin = async (e) => {
    e?.preventDefault()
    if (!inviteInput.trim()) { setJoinError('Enter the invite code from your opponent.'); return }
    setJoinError('')
    setJoining(true)
    try {
      const s = await joinSession(inviteInput.trim().toUpperCase())
      if (s?.session?.status === 'auction') navigate('/auction')
    } catch (err) {
      setJoinError(err.response?.data?.error || "Couldn't join that game. Check the code.")
    } finally { setJoining(false) }
  }

  if (loading && !session) return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted"><Spinner size="lg" /></div>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 fade-in">
      <PageHeader eyebrow={`Signed in as ${user?.username}`} title={waitingForOpponent ? 'Waiting for your opponent' : 'Start a game'}>
        {waitingForOpponent
          ? 'Send this code to your opponent. The auction starts as soon as they join.'
          : 'A game is you against one friend for the whole IPL season.'}
      </PageHeader>

      {waitingForOpponent ? (
        <div className="max-w-md space-y-3">
          <InviteCodeBox code={session?.session?.inviteCode} />
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <span className="live-dot w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
            Waiting for them to join…
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="card p-6 flex flex-col" aria-labelledby="create-heading">
            <h2 id="create-heading" className="display text-2xl">New game</h2>
            <p className="text-sm text-ink-2 mt-2 mb-5 flex-1">You get an invite code to send to your opponent.</p>
            {createError && <Alert type="danger" className="mb-4">{createError}</Alert>}
            <button className="btn-primary w-full py-3" onClick={handleCreate} disabled={creating}>
              {creating ? <Spinner size="sm" label="Creating game" /> : <><Plus size={18} aria-hidden="true" />Create game</>}
            </button>
          </section>

          <section className="card p-6 flex flex-col" aria-labelledby="join-heading">
            <h2 id="join-heading" className="display text-2xl">Join a game</h2>
            <p className="text-sm text-ink-2 mt-2 mb-5 flex-1">Enter the 6-character code your opponent sent you.</p>
            {joinError && <Alert type="danger" className="mb-4">{joinError}</Alert>}
            <form onSubmit={handleJoin} className="flex gap-2">
              <label htmlFor="invite" className="sr-only">Invite code</label>
              <input
                id="invite"
                className="input score text-xl tracking-[0.25em] uppercase flex-1 min-w-0"
                placeholder="ABC234"
                value={inviteInput}
                onChange={e => setInviteInput(e.target.value.toUpperCase())}
                maxLength={6}
                autoComplete="off"
              />
              <button type="submit" className="btn-secondary px-5" disabled={joining}>
                {joining ? <Spinner size="sm" label="Joining" /> : <><LogIn size={18} aria-hidden="true" />Join</>}
              </button>
            </form>
          </section>
        </div>
      )}

      <div className="grid md:grid-cols-[3fr_2fr] gap-8 mt-12">
        <section aria-labelledby="how-heading">
          <SectionHeading id="how-heading">How to play</SectionHeading>
          <ol className="divide-rows border-y border-line">
            {STEPS.map(([name, text], i) => (
              <li key={name} className="flex gap-4 py-3.5">
                <span className="score text-xl text-accent w-5 flex-shrink-0">{i + 1}</span>
                <div>
                  <div className="font-medium">{name}</div>
                  <p className="text-sm text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="points-heading">
          <SectionHeading id="points-heading">Points</SectionHeading>
          <table className="w-full text-sm">
            <tbody className="divide-rows border-y border-line">
              <tr><td className="py-2.5">Your team beats theirs</td><td className="py-2.5 text-right"><span className="tag-win score text-sm">+2</span></td></tr>
              <tr><td className="py-2.5">Tie or no result</td><td className="py-2.5 text-right"><span className="tag-draw score text-sm">+1 each</span></td></tr>
              <tr><td className="py-2.5">Your team loses</td><td className="py-2.5 text-right"><span className="tag-neutral score text-sm">0</span></td></tr>
            </tbody>
          </table>
          <p className="text-sm text-ink-2 mt-4">
            If you own both teams in a match, you pick which side you play before match day and your opponent gets the other.
            No free points.
          </p>
        </section>
      </div>
    </div>
  )
}
