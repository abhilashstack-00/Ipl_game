# 🏏 IPL Strategy Arena

A full-stack, two-player IPL strategy game where managers compete by owning IPL teams and earning points from real match outcomes — using **virtual credits only** (no real money).

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ 
- npm v9+

### 1. Install all dependencies
```bash
cd ipl-game
npm run install:all
```

### 2. Seed demo accounts (optional)
```bash
node setup.js
```
This creates:
- `Player1` / `ipl2025`
- `Player2` / `ipl2025`

### 3. Start app (auto-opens browser)
```bash
npm run dev:open
```

This command starts both backend and frontend, then opens the React app automatically once Vite is ready.

If you use `npm run dev` instead, open the URL shown by Vite manually.

Do not use VS Code "Show Preview" on `frontend/index.html` for this project. The frontend is served by Vite and must run through the dev server.

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:5173  |
| Backend  | http://localhost:3001  |
| API docs | http://localhost:3001/api/health |

---

## 🎮 How to Play

### Step 1 — Register & Login
- Both players register with unique usernames
- Each starts with **100 virtual credits**

### Step 2 — Create or Join a Session
- Player 1 clicks **Create Game Session** and gets a 6-character invite code
- Player 2 clicks **Join a Game** and enters the code
- Both players are now in the same game session

### Step 3 — Team Auction
Each player builds a squad of **up to 5 IPL teams**:

| Action | Cost |
|--------|------|
| Select Home Team (free) | 0 credits |
| Buy a team (market rate) | 11–18 credits |
| Win a bidding war | Your bid amount |

**Home Team Rules:**
- Each player can pick one home team for free
- If both pick the same team → **Bidding War!** Highest bid wins

**Team Base Prices:**
| Team | Price |
|------|-------|
| CSK, MI | 18cr |
| RCB | 16cr |
| KKR | 15cr |
| DC, SRH | 14cr |
| RR | 13cr |
| PBKS, GT | 12cr |
| LSG | 11cr |

### Step 4 — Start the Season
Once both players have built their squads, click **Finalize & Start Season**.

### Step 5 — Process Matches
Go to **Matches** tab and:
- See which matches are **contests** (each team owned by a different player)
- Simulate a result with 🎲 or enter manually
- Apply the result to award points

### Points System
| Outcome | Points |
|---------|--------|
| Your team wins | +2 |
| Draw / Tie | +1 each |
| Your team loses | 0 |

### Special Rule: Both Teams Owned by Same Player
If one player owns both teams in a match, it is **not a contest** — no points awarded. The match is marked "No contest".

---

## 🏗️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + React Router v6 |
| Styling | Tailwind CSS + Custom CSS |
| Backend | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Real-time | Socket.io |
| Build tool | Vite |

---

## 📁 Project Structure

```
ipl-game/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── database.js      # SQLite init & schema
│   │   │   └── iplData.js       # Teams & match schedule
│   │   ├── middleware/
│   │   │   └── auth.js          # JWT middleware
│   │   ├── routes/
│   │   │   ├── auth.js          # /api/auth/*
│   │   │   └── game.js          # /api/game/*
│   │   └── server.js            # Express + Socket.io
│   ├── data/                    # SQLite DB file (auto-created)
│   ├── .env
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   └── UI.jsx           # Reusable components
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── GameContext.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── LobbyPage.jsx
│   │   │   ├── AuctionPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── MatchesPage.jsx
│   │   │   ├── LeaderboardPage.jsx
│   │   │   └── SquadsPage.jsx
│   │   ├── utils/
│   │   │   ├── api.js           # Axios + Socket.io setup
│   │   │   └── iplData.js       # Frontend team data
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
│
├── setup.js                     # Seed demo accounts
├── package.json                 # Root scripts
└── README.md
```

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |

### Game
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/game/session` | Create session |
| POST | `/api/game/session/join` | Join via invite code |
| GET | `/api/game/session` | Get active session |
| POST | `/api/game/home-team` | Select free home team |
| POST | `/api/game/bid` | Place bid (conflict resolution) |
| POST | `/api/game/buy-team` | Buy team with credits |
| POST | `/api/game/finalize-auction` | Start the season |
| GET | `/api/game/matches/:sessionId` | Get all matches with ownership |
| POST | `/api/game/process-match` | Apply match result, award points |
| GET | `/api/game/leaderboard` | Global leaderboard |
| GET | `/api/game/ipl-data` | Teams + schedule |

---

## 🔄 Real-time Events (Socket.io)

| Event | Direction | Payload |
|-------|-----------|---------|
| `join-session` | Client → Server | `{ sessionId, userId, username }` |
| `team-bought` | Client → Server | `{ sessionId, teamId, price }` |
| `home-team-selected` | Client → Server | `{ sessionId, teamId, conflict }` |
| `bid-placed` | Client → Server | `{ sessionId, teamId }` |
| `match-processed` | Client → Server | `{ sessionId, matchId }` |
| `auction-update` | Server → Client | `{ type, message, ... }` |
| `match-result` | Server → Client | `{ matchId, winnerName, points }` |
| `player-joined` | Server → Client | `{ username }` |

---

## 🛠️ Development Tips

### Reset the database
```bash
rm backend/data/ipl_game.db
node setup.js
```

### Add more matches
Edit `backend/src/db/iplData.js` and add entries to `MATCH_SCHEDULE`. IDs must be unique strings.

### Change JWT secret
Edit `backend/.env` → `JWT_SECRET=your-secret-here`

### Build for production
```bash
npm run build
# Serve frontend/dist with any static server
# Set NODE_ENV=production in backend/.env
```

---

## ✅ Features Checklist

- [x] JWT Authentication (register/login)
- [x] SQLite persistent database
- [x] Session creation with invite code
- [x] Real-time sync via Socket.io
- [x] 100 virtual credits per player
- [x] Home team selection (free)
- [x] Bidding war on conflict
- [x] Team purchase with credit validation
- [x] 30-match IPL 2025 schedule
- [x] Contest detection (each team = different owner)
- [x] Match result simulation + manual entry
- [x] Point system (W=+2, D=+1, L=0)
- [x] "Both teams owned" no-contest rule
- [x] Live leaderboard
- [x] Match history
- [x] Squad comparison view
- [x] Responsive Tailwind UI
- [x] Cricket-themed dark design (Teko/Rajdhani fonts)
- [x] Toast notifications

---

## 🌐 Deploy For Friends (Render + GitHub Pages)

This project is full-stack, so deploy backend first, then frontend.

### 1. Deploy Backend (Render)

1. Push this repo to GitHub.
2. Create a new **Web Service** in Render from the repo.
3. Set service root to `backend`.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables:

```env
JWT_SECRET=your-strong-secret
FRONTEND_URLS=https://YOUR_GITHUB_USERNAME.github.io/ipl-game,http://localhost:5173
```

After deploy, note backend URL like:
`https://ipl-game-backend.onrender.com`

### 2. Configure Frontend Production Env

Create `frontend/.env.production` from `frontend/.env.production.example`:

```env
VITE_API_URL=https://ipl-game-backend.onrender.com
VITE_SOCKET_URL=https://ipl-game-backend.onrender.com
```

### 3. Deploy Frontend To GitHub Pages

In `frontend/package.json`, set homepage to your actual GitHub username:

```json
"homepage": "https://YOUR_GITHUB_USERNAME.github.io/ipl-game"
```

Then run:

```bash
cd frontend
npm install
npm run deploy
```

Your app URL will be:
`https://YOUR_GITHUB_USERNAME.github.io/ipl-game`

### 4. Verify Multiplayer

1. Open the GitHub Pages URL in two different browsers/devices.
2. Register two users.
3. Create and join a session via invite code.
4. Confirm auction and match updates are real-time in both clients.

### Notes

- GitHub Pages hosts only frontend static files.
- Backend must stay online on Render (or similar) for auth, game APIs, and Socket.io.
- Render free tier can sleep when idle; first request may take a few seconds.

---

*Built with ❤️ for the love of cricket and IPL*
