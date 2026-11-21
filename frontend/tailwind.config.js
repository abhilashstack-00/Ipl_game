/** @type {import('tailwindcss').Config} */
// Colours and fonts come from CSS variables in src/index.css, so one set of class names
// works for both themes: light ("scorebook") and dark ("floodlight").
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        inset: token('inset'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        muted: token('muted'),
        primary: token('primary'),
        'on-primary': token('on-primary'),
        accent: token('accent'),
        win: token('win'),
        loss: token('loss'),
        draw: token('draw'),
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        score: 'var(--font-score)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        card: 'var(--radius-card)',
      },
    },
  },
  plugins: [],
}
