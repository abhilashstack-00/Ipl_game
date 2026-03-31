import React, { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ipl_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ipl_token')
    if (token) {
      api.get('/auth/me')
        .then(r => { setUser(r.data.user); localStorage.setItem('ipl_user', JSON.stringify(r.data.user)) })
        .catch(() => { localStorage.removeItem('ipl_token'); localStorage.removeItem('ipl_user'); setUser(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const r = await api.post('/auth/login', { username, password })
    localStorage.setItem('ipl_token', r.data.token)
    localStorage.setItem('ipl_user', JSON.stringify(r.data.user))
    setUser(r.data.user)
    return r.data.user
  }

  const register = async (username, password) => {
    const r = await api.post('/auth/register', { username, password })
    localStorage.setItem('ipl_token', r.data.token)
    localStorage.setItem('ipl_user', JSON.stringify(r.data.user))
    setUser(r.data.user)
    return r.data.user
  }

  const logout = () => {
    localStorage.removeItem('ipl_token')
    localStorage.removeItem('ipl_user')
    setUser(null)
  }

  const refreshUser = async () => {
    const r = await api.get('/auth/me')
    setUser(r.data.user)
    localStorage.setItem('ipl_user', JSON.stringify(r.data.user))
    return r.data.user
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
