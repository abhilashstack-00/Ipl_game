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

const corsOptions = {
  origin: function(origin, callback) {
    // List of allowed origins
    const allowedOrigins = [
      'https://abhilashstack-00.github.io',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];
    
    // Allow requests with no origin (e.g., mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in the allowlist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Also allow if FRONTEND_URLS env var contains this origin
    const envUrls = process.env.FRONTEND_URLS || '';
    const envOrigins = envUrls.split(',').map(url => url.trim());
    if (envOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(null, true); // Allow all for now to debug
  },
  methods: ['GET', 'POST'],
  credentials: true,
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
const sessionRooms = new Map(); // sessionId → Set of socket ids

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('join-session', ({ sessionId, userId, username }) => {
    socket.join(`session:${sessionId}`);
    socket.data = { sessionId, userId, username };
    console.log(`[Socket] ${username} joined session ${sessionId}`);
    socket.to(`session:${sessionId}`).emit('player-joined', { userId, username });
  });

  socket.on('leave-session', ({ sessionId }) => {
    socket.leave(`session:${sessionId}`);
  });

  // Broadcast game state update to all in session
  socket.on('state-update', ({ sessionId, event, data }) => {
    socket.to(`session:${sessionId}`).emit('state-update', { event, data });
  });

  // Auction events
  socket.on('team-bought', ({ sessionId, teamId, userId, username, price }) => {
    io.to(`session:${sessionId}`).emit('auction-update', {
      type: 'team-bought',
      teamId, userId, username, price,
      message: `${username} bought ${teamId.toUpperCase()} for ${price} cr!`,
    });
  });

  socket.on('home-team-selected', ({ sessionId, teamId, userId, username, conflict }) => {
    io.to(`session:${sessionId}`).emit('auction-update', {
      type: conflict ? 'bid-war-started' : 'home-team-selected',
      teamId, userId, username,
      message: conflict
        ? `⚔️ Both players want ${teamId.toUpperCase()}! Bidding war begins!`
        : `${username} selected ${teamId.toUpperCase()} as home team (FREE)`,
    });
  });

  socket.on('bid-placed', ({ sessionId, teamId, userId, username }) => {
    io.to(`session:${sessionId}`).emit('auction-update', {
      type: 'bid-placed',
      teamId, userId, username,
      message: `${username} placed a bid on ${teamId.toUpperCase()}`,
    });
  });

  socket.on('match-processed', ({ sessionId, matchId, winnerName, points }) => {
    io.to(`session:${sessionId}`).emit('match-result', {
      matchId, winnerName, points,
      message: `🏆 ${winnerName} earns ${points} points!`,
    });
  });

  socket.on('disconnect', () => {
    if (socket.data?.sessionId && socket.data?.username) {
      socket.to(`session:${socket.data.sessionId}`).emit('player-disconnected', {
        username: socket.data.username,
      });
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
