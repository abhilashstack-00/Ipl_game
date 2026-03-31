import axios from 'axios'
import { io } from 'socket.io-client'

const BASE_URL = import.meta.env.VITE_API_URL || ''

// Axios instance
export const api = axios.create({ baseURL: `${BASE_URL}/api` })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ipl_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ipl_token')
      localStorage.removeItem('ipl_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Socket.io singleton
let socket = null
export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

export function connectSocket(userData) {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}
