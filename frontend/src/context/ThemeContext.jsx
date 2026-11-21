import React, { createContext, useContext, useEffect, useState } from 'react'

// 'light' = scorebook, 'dark' = floodlight. index.html sets the first value before React loads.
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} })
const STORAGE_KEY = 'arena_theme'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* private mode: theme just won't be remembered */ }
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
