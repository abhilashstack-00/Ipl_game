import React from 'react'
import { Wordmark, ThemeToggle } from './Header'

const RULES = [
  ['Auction', 'Both managers get 100 credits and bid on the ten IPL teams. Up to five teams each.'],
  ['Home team', 'Each manager picks one team for free before the bidding starts.'],
  ['Score', 'When two of your teams meet theirs: win 2 points, no result 1 point each, loss 0.'],
]

// Shared frame for the login and register pages: a short pitch on the left, the form on the right.
export default function AuthLayout({ title, children, footer }) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-between items-center px-4 sm:px-6 h-14">
        <Wordmark />
        <ThemeToggle />
      </div>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-[1fr_minmax(0,26rem)] gap-10 md:gap-16 items-center">
        <section className="order-2 md:order-1" aria-labelledby="pitch-heading">
          <p className="eyebrow mb-2">IPL 2026 · two players</p>
          <h2 id="pitch-heading" className="display text-4xl sm:text-5xl max-w-md">Two managers. Ten teams. One season.</h2>
          <ol className="mt-8 space-y-4 max-w-md">
            {RULES.map(([name, text], i) => (
              <li key={name} className="flex gap-4">
                <span className="score text-2xl text-accent w-6 flex-shrink-0">{i + 1}</span>
                <div>
                  <div className="font-medium">{name}</div>
                  <p className="text-sm text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="order-1 md:order-2 card p-6 sm:p-8" aria-labelledby="form-heading">
          <h1 id="form-heading" className="display text-3xl mb-6">{title}</h1>
          {children}
          {footer && <div className="mt-6 pt-5 border-t border-line text-sm text-ink-2">{footer}</div>}
        </section>
      </div>
    </div>
  )
}
