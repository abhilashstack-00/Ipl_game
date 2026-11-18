require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');

const app = express();
const server = http.createServer(app);

const db = require('./db/database');
const { verifyTokenAndLoadUser } = require('./middleware/auth');
const { promoteConfiguredAdmins } = require('./services/adminBootstrap');

// Re-apply admins listed in ADMIN_USERNAMES (needed on hosts where the DB can be wiped).
promoteConfiguredAdmins(db);

const DEFAULT_ORIGINS = [
  'https://abhilashstack-00.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const allowedOrigins = new Set([
  ...DEFAULT_ORIGINS,
  ...(process.env.FRONTEND_URLS || '').split(',').map(u => u.trim()).filter(Boolean),
]);

const corsOptions = {
  origin: function(origin, callback) {
    // Requests without an Origin header (curl, server-to-server) carry no browser credentials;
    // every API route still requires a valid JWT.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST'],
  // Auth uses a Bearer header, not cookies, so credentialed CORS is unnecessary.
  credentials: false,
};

const io = new Server(server, {
  cors: corsOptions,
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Socket.io - Real-time game updates
// Clients may only (1) authenticate and (2) ask to subscribe to their own session's room.
// All game events are emitted by the server from route handlers after the DB write commits.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

io.use((socket, next) => {
  const user = verifyTokenAndLoadUser(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = { id: user.id, username: user.username };
  next();
});

io.on('connection', (socket) => {
  const { id: userId, username } = socket.data.user;
  console.log(`[Socket] Connected: ${socket.id} (${username})`);

  socket.on('join-session', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const sessionId = payload?.sessionId;
    // Any userId/username in the payload is ignored; identity comes from the verified JWT.
    if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
      socket.emit('join-error', { error: 'Invalid session' });
      return reply({ ok: false, error: 'Invalid session' });
    }
    const member = db.prepare(`
      SELECT 1 FROM session_players sp JOIN game_sessions gs ON gs.id = sp.session_id
      WHERE sp.session_id = ? AND sp.user_id = ? AND gs.status != 'finished'
    `).get(sessionId, userId);
    if (!member) {
      socket.emit('join-error', { error: 'Not a member of this session' });
      return reply({ ok: false, error: 'Not a member of this session' });
    }

    // One session room per socket.
    if (socket.data.sessionId && socket.data.sessionId !== sessionId) {
      socket.leave(`session:${socket.data.sessionId}`);
    }
    socket.join(`session:${sessionId}`);
    socket.data.sessionId = sessionId;
    console.log(`[Socket] ${username} joined session ${sessionId}`);
    socket.to(`session:${sessionId}`).emit('player-joined', { userId, username });
    reply({ ok: true });
  });

  socket.on('leave-session', () => {
    if (socket.data.sessionId) {
      socket.leave(`session:${socket.data.sessionId}`);
      socket.data.sessionId = null;
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.sessionId) {
      socket.to(`session:${socket.data.sessionId}`).emit('player-disconnected', { username });
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// Make io accessible to routes
app.set('io', io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   IPL Strategy Game - Backend        ║
║   Server running on port ${PORT}        ║
║   http://localhost:${PORT}              ║
╚══════════════════════════════════════╝
  `);
});
