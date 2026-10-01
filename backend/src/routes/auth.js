const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { signToken } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores bytes beyond 72

function onlyFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return Object.keys(body).every((k) => allowed.includes(k));
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    if (!onlyFields(req.body, ['username', 'password'])) return res.status(400).json({ error: 'Unexpected fields in request' });
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Username and password required' });
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-24 letters, numbers or underscores' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return res.status(400).json({ error: 'Password is too long' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, credits, points, wins, losses, draws, matches_played)
      VALUES (?, ?, ?, 100, 0, 0, 0, 0, 0)
    `).run(id, username, hash);

    const user = db.prepare('SELECT id, username, role, credits, points, wins, losses, draws, matches_played FROM users WHERE id = ?').get(id);
    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    if (!onlyFields(req.body, ['username', 'password'])) return res.status(400).json({ error: 'Unexpected fields in request' });
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (username.length > 64 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { password_hash, ...safeUser } = user;
    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, role, credits, points, wins, losses, draws, matches_played FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
