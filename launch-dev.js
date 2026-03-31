#!/usr/bin/env node

const { spawn } = require('child_process')
const net = require('net')

const FRONTEND_PORT = 5173
const FRONTEND_HOST = 'localhost'
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`
const CHECK_INTERVAL_MS = 500
const OPEN_TIMEOUT_MS = 60000

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()

    socket.setTimeout(1000)

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })

    const onFail = () => {
      socket.destroy()
      resolve(false)
    }

    socket.once('timeout', onFail)
    socket.once('error', onFail)

    socket.connect(port, FRONTEND_HOST)
  })
}

function openBrowser(url) {
  const platform = process.platform

  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true })
    return
  }

  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true })
    return
  }

  spawn('xdg-open', [url], { stdio: 'ignore', detached: true })
}

function waitForFrontendAndOpen() {
  const startedAt = Date.now()
  let opened = false

  const timer = setInterval(async () => {
    if (opened) return

    const up = await isPortOpen(FRONTEND_PORT)
    if (up) {
      opened = true
      clearInterval(timer)
      console.log(`\nOpening ${FRONTEND_URL} in your browser...\n`)
      openBrowser(FRONTEND_URL)
      return
    }

    if (Date.now() - startedAt > OPEN_TIMEOUT_MS) {
      clearInterval(timer)
      console.log(`\nCould not detect frontend on port ${FRONTEND_PORT} within ${OPEN_TIMEOUT_MS / 1000}s.`)
      console.log(`Open it manually once ready: ${FRONTEND_URL}\n`)
    }
  }, CHECK_INTERVAL_MS)
}

console.log('Starting backend + frontend dev servers...')
waitForFrontendAndOpen()

const command = process.platform === 'win32' ? 'cmd' : 'npm'
const args = process.platform === 'win32' ? ['/c', 'npm', 'run', 'dev'] : ['run', 'dev']

const child = spawn(command, args, {
  stdio: 'inherit',
})

child.on('exit', (code) => {
  process.exit(code || 0)
})
