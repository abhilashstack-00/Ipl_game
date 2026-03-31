#!/usr/bin/env node
/**
 * Setup script — seeds two demo users for testing.
 * Run: node setup.js
 */
const path = require('path')
const fs = require('fs')

// Ensure data dir
const dataDir = path.join(__dirname, 'backend/data')
fs.mkdirSync(dataDir, { recursive: true })

const Database = require(path.join(__dirname, 'backend/node_modules/better-sqlite3'))
const bcrypt = require(path.join(__dirname, 'backend/node_modules/bcryptjs'))
const { v4: uuidv4 } = require(path.join(__dirname, 'backend/node_modules/uuid'))

const DB_PATH = path.join(dataDir, 'ipl_game.db')
const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    credits INTEGER DEFAULT 100,
    points INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`)

const seedUsers = [
  { username: 'Player1', password: 'ipl2025' },
  { username: 'Player2', password: 'ipl2025' },
]

console.log('\n🏏 IPL Strategy Game — Setup\n')

for (const u of seedUsers) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username)
  if (existing) {
    console.log(`  ✓ User "${u.username}" already exists`)
    continue
  }
  const hash = bcrypt.hashSync(u.password, 10)
  const id = uuidv4()
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, u.username, hash)
  console.log(`  ✓ Created user: ${u.username} / ${u.password}`)
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Demo accounts ready!
  Username: Player1  Password: ipl2025
  Username: Player2  Password: ipl2025
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Next steps:
  1. cd ipl-game
  2. npm run install:all
  3. npm run dev
  4. Open http://localhost:5173

`)
db.close()
