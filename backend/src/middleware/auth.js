const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;
const PLACEHOLDER_SECRETS = new Set(['replace-with-a-strong-random-secret', 'your-strong-secret', 'your-secret-here']);

// Fail fast: never fall back to a hardcoded secret, or anyone who reads the repo can forge tokens.
if (!JWT_SECRET || PLACEHOLDER_SECRETS.has(JWT_SECRET)) {
  throw new Error(
    'JWT_SECRET is missing or still a placeholder. Set it in backend/.env (local) or your host\'s environment ' +
    '(Render). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}
if (JWT_SECRET.length < 32) {
  console.warn('[auth] JWT_SECRET is shorter than 32 characters; use a longer random value.');
}

const JWT_ALGORITHM = 'HS256';

/**
 * Verify a JWT and confirm its user still exists. Identity (id, username, role) is always
 * read from the database, never from token claims or request input.
 * Returns the user row or null.
 */
function verifyTokenAndLoadUser(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch {
    return null;
  }
  if (!decoded || typeof decoded.id !== 'string') return null;
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.id);
  return user || null;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const user = verifyTokenAndLoadUser(authHeader.slice('Bearer '.length));
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = { id: user.id, username: user.username, role: user.role };
  next();
}

// Authorization is separate from authentication: the role is re-read from the DB above,
// so a role claim inside a (validly signed) token or the request body has no effect.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function signToken(payload) {
  // Only identity goes in the token. Roles are looked up server-side on every request.
  return jwt.sign({ id: payload.id, username: payload.username }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: '7d',
  });
}

module.exports = { authMiddleware, requireAdmin, signToken, verifyTokenAndLoadUser };
