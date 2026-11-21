# Strategy Arena

A two-player IPL strategy game. Two managers auction the ten IPL teams with virtual credits, then score points all season from the real match results. No real money is involved.

Play it at **https://abhilashstack-00.github.io/Ipl_game/**

The site has a light theme ("scorebook") and a dark theme ("floodlight"); switch with the sun/moon button in the header.

---

## How to play

1. **Start a game.** One player creates a game and sends the 6-character invite code; the other joins with it.
2. **Pick a home team.** Each player takes one team for free. First come, first served: once a team is taken, the other player picks a different one.
3. **Auction.** The remaining teams come up one at a time for 20 seconds each. Both players bid in secret; the highest bid wins and only the winner pays. Everyone starts with 100 credits and can own up to 5 teams.
   - A team nobody bids on is skipped.
   - **As soon as one player has 5 teams, bidding ends.** Every unsold team goes to the other player at its base price. If they can't afford it all, their credits stop at 0.
4. **Start the season.** Either player clicks **Start the season** once the auction is complete.
5. **Score.** Whenever one of your teams plays one of your opponent's teams (a *contest*), the real result decides the points. Results come in automatically; nobody enters them by hand except the site admin as a fallback.

| Result | Points |
|---|---|
| Your team wins | +2 |
| Tie or no result | +1 each |
| Your team loses | 0 |

**When you own both teams in a match:** pick which side you play (the **Play as** buttons on the Dashboard or Fixtures page) before match day. Your opponent gets the other side. If no side is picked by match day, the match doesn't score.

**Base prices**

| Team | Credits |
|---|---|
| CSK, MI | 18 |
| RCB | 16 |
| KKR | 15 |
| DC, SRH | 14 |
| RR | 13 |
| PBKS, GT | 12 |
| LSG | 11 |

### Pages

- **Lobby:** create or join a game, rules and points.
- **Auction:** home team, live bidding with a timer, both squads and the auction log.
- **Dashboard:** score, next contest, your record and squad, recent results.
- **Fixtures:** every match, filtered by contests, your teams or all; upcoming, waiting for a result, and played.
- **Head-to-head:** you against your opponent, both squads and every contest so far.
- **Admin** (admins only): enter an official result when the live feed has none.

---

## Run it locally

You need **Node.js 20 or newer** and npm.

```bash
git clone https://github.com/abhilashstack-00/Ipl_game.git
cd Ipl_game
npm run install:all
```

Create the backend settings file and give it a secret. The backend will not start without `JWT_SECRET`.

```bash
cp backend/.env.example backend/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the printed value after `JWT_SECRET=` in `backend/.env`. Then, optionally, create two demo accounts (`Player1` and `Player2`, password `ipl2025`):

```bash
node setup.js
```

Start the backend and frontend together; the browser opens when it's ready:

```bash
npm run dev:open
```

| Service | URL |
|---|---|
| Site | http://localhost:5173 |
| Backend | http://localhost:3002 (health check: `/api/health`) |

The site must run through Vite (`npm run dev:open` or `npm run dev`). Opening `frontend/index.html` directly shows a blank page.

### Admins

An admin can enter official results on the Admin page when the live feed has none. Results can't be changed once saved. Two ways to make someone an admin:

- Set `ADMIN_USERNAMES=name1,name2` in `backend/.env` (or on Render). Exact spelling, capitals count. Listed accounts become admin when the server starts or when they register.
- Or run `node setup.js --admin <username>` (`--revoke-admin` to undo). This needs access to the server's database file.

---

## Deploy

The backend runs on Render and the site on GitHub Pages. Always deploy both together.

### Backend (Render web service)

- Root directory `backend`, build command `npm install`, start command `npm start`.
- Environment variables:

| Variable | Value |
|---|---|
| `JWT_SECRET` | A long random value (see the command above). Required. |
| `FRONTEND_URLS` | `https://abhilashstack-00.github.io` (origin only, no path) |
| `ADMIN_USERNAMES` | Your admin username |
| `ALLOW_TEST_HELPER` | `false`, or leave it out |
| `LIVE_MATCH_PROVIDER`, `CRICAPI_KEY` | `cricapi` and your key, for live results |

### Site (GitHub Pages)

GitHub Pages serves the built `index.html` and `assets/` from the root of `main`. After changing the frontend:

1. Make sure `frontend/.env.production` has `VITE_API_URL` and `VITE_SOCKET_URL` set to the Render URL (copy `frontend/.env.production.example`).
2. Build and copy the output to the repo root:

```bash
npm run build
```

Then replace the root `index.html` and `assets/` with `frontend/dist/index.html` and `frontend/dist/assets/`, commit, and push.

### Free-tier notes

- Render's free server sleeps when idle. The first visit shows "Waking up the game server" for up to a minute.
- Render's free disk is wiped on every restart or redeploy, so **all accounts and games are lost** each time. Register your admin account again right after a deploy.

---

## Testing

`security-tests/attack.js` runs about 39 attack and functional checks against a local server and prints `SECURE` or `VULNERABLE` for each. Run it after any backend change. See [`security-tests/README.md`](security-tests/README.md) for the exact commands. It needs a throwaway database and test-only settings, so never run it against the live server.

---

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 18, React Router 6 (hash routing), Vite 5, Tailwind CSS 3, lucide-react icons |
| Backend | Node.js, Express 4 |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (jsonwebtoken) and bcrypt password hashes |
| Real-time | Socket.IO 4 |
| Live results | CricAPI (optional) |

---

## Project structure

```
backend/
  src/
    db/database.js          schema and migrations
    db/iplData.js           teams and the built-in schedule
    middleware/auth.js      JWT checks, admin check
    routes/auth.js          /api/auth/*
    routes/game.js          /api/game/* (auction, matches, results, admin)
    services/liveScores.js  CricAPI client
    services/adminBootstrap.js  ADMIN_USERNAMES
    server.js               Express, CORS, Socket.IO
frontend/
  src/
    components/             Header, UI kit, match rows, auth layout, server wake-up screen
    context/                Auth, Game (API calls and sockets), Theme
    pages/                  Login, Register, Lobby, Auction, Dashboard, Matches (Fixtures),
                            HeadToHead, Admin
    utils/                  API client, team data, match helpers
    index.css               the two themes (colour and font variables)
security-tests/             attack and regression checks
setup.js                    demo accounts and admin promotion
index.html, assets/         the built site that GitHub Pages serves
```

---

## API reference

All game routes need `Authorization: Bearer <token>`. Routes that take a `sessionId` only work for players in that game. Request bodies may only contain the listed fields.

### Auth

| Method | Route | What it does |
|---|---|---|
| POST | `/api/auth/register` | Create an account (`username`, `password`) |
| POST | `/api/auth/login` | Log in, returns a token |
| GET | `/api/auth/me` | Current user |

### Game

| Method | Route | What it does |
|---|---|---|
| POST | `/api/game/session` | Create a game |
| POST | `/api/game/session/join` | Join with an invite code |
| GET | `/api/game/session` | Your current game |
| POST | `/api/game/session/leave` | Leave (ends the game for both players) |
| POST | `/api/game/home-team` | Pick your free home team |
| POST | `/api/game/bid` | Bid on the team being auctioned |
| POST | `/api/game/finalize-auction` | Start the season |
| GET | `/api/game/matches/:sessionId` | Fixtures with owners and results (applies any new official results) |
| POST | `/api/game/match-choice` | Pick your side when you own both teams |
| POST | `/api/game/process-match` | Apply a match's official result to this game |
| GET | `/api/game/ipl-data` | Teams and built-in schedule (no login needed) |
| GET | `/api/game/admin/matches` | Admin: every match and its result source |
| POST | `/api/game/admin/match-result` | Admin: record an official result (can't overwrite) |
| GET | `/api/game/live-status` | Admin: live feed status |

The client never sends a match winner; results only come from the schedule, the live feed or an admin.

### Real-time events (Socket.IO)

Connect with the token: `io(url, { auth: { token } })`. Clients can only join or leave their own game's room; every game event comes from the server after the database write.

| Event | Direction | Meaning |
|---|---|---|
| `join-session` | client to server | Subscribe to your game (`{ sessionId }`) |
| `leave-session` | client to server | Unsubscribe |
| `join-error` | server to client | Join refused |
| `auction-update` | server to client | Home team picked, bid placed |
| `match-result` | server to client | Points awarded for a match |
| `state-update` | server to client | Something changed; refetch |
| `player-joined`, `player-disconnected` | server to client | Opponent presence |

---

## Known limitations

- Accounts and games are wiped whenever the Render server restarts (free tier). Moving to a hosted database such as Turso would fix it.
- The built-in schedule covers 30 matches up to 20 April 2026; later fixtures come only from the live feed.
- Points are also added to each account's lifetime total. The site shows per-game scores, but those lifetime totals mix games.
- If neither player reaches 5 teams, the auction ends after one pass with some teams unsold.
- The code has a "bidding war" for when both players want the same home team, but it can't trigger: the first pick is assigned straight away.
- Leaving a game ends it for both players.

For the security model and its assumptions, see [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).
