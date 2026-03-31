const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/ipl_game.db');
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
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

    CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'auction',
      invite_code TEXT UNIQUE,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      started_at INTEGER,
      creator_id TEXT,
      FOREIGN KEY(creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS session_players (
      session_id TEXT,
      user_id TEXT,
      credits INTEGER DEFAULT 100,
      joined_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY(session_id, user_id),
      FOREIGN KEY(session_id) REFERENCES game_sessions(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_ownerships (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT,
      team_id TEXT,
      price_paid INTEGER DEFAULT 0,
      is_home_team INTEGER DEFAULT 0,
      acquired_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(session_id) REFERENCES game_sessions(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      team_id TEXT,
      user_id TEXT,
      amount INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(session_id) REFERENCES game_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS match_results (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      match_id TEXT,
      winner_team TEXT,
      loser_team TEXT,
      winner_user_id TEXT,
      loser_user_id TEXT,
      points_to_winner INTEGER,
      points_to_loser INTEGER,
      is_draw INTEGER DEFAULT 0,
      processed_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(session_id) REFERENCES game_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS home_team_selections (
      session_id TEXT,
      user_id TEXT,
      team_id TEXT,
      PRIMARY KEY(session_id, user_id),
      FOREIGN KEY(session_id) REFERENCES game_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS auction_state (
      session_id TEXT PRIMARY KEY,
      current_team_index INTEGER DEFAULT 0,
      active_team_id TEXT,
      round_ends_at INTEGER,
      status TEXT DEFAULT 'pending',
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(session_id) REFERENCES game_sessions(id)
    );
  `);

  // Migration for existing DBs created before session-level credits were introduced.
  const sessionPlayerCols = db.prepare('PRAGMA table_info(session_players)').all();
  const hasCreditsCol = sessionPlayerCols.some(c => c.name === 'credits');
  if (!hasCreditsCol) {
    db.exec('ALTER TABLE session_players ADD COLUMN credits INTEGER DEFAULT 100');
  }

  db.prepare('UPDATE session_players SET credits = 100 WHERE credits IS NULL').run();
}

init();
module.exports = db;
