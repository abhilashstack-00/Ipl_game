# IPL Strategy Arena

Two-player IPL fantasy game. Players auction real IPL teams with virtual credits (no real money), then earn points from real match results: win +2, draw/no-result +1 each, loss 0.

- Live frontend: https://abhilashstack-00.github.io/Ipl_game/ (GitHub Pages, HashRouter)
- Backend: Render web service (`backend/`), free tier
- Owner works on Windows.

## Stack
- **Frontend** (`frontend/`): React 18, Vite 5, React Router 6 (HashRouter), Tailwind 3, axios, socket.io-client
- **Backend** (`backend/`): Node + Express 4, better-sqlite3 (WAL), JWT (jsonwebtoken + bcryptjs), Socket.IO 4
- Plain JavaScript, no TypeScript. CommonJS in the backend, ES modules in the frontend.

## Run locally
```bash
npm run install:all                          # root, backend, frontend
cp backend/.env.example backend/.env         # then set JWT_SECRET (required, see below)
node setup.js                                # demo users Player1 / Player2
npm run dev:open                             # backend :3002 + Vite :5173, opens browser
node setup.js --admin <username>             # make a user an admin (or set ADMIN_USERNAMES, see Deploy)
```
Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
The backend refuses to start without a real `JWT_SECRET`. That is intentional; do not add a fallback.
Vite proxies `/api` and `/socket.io` to `localhost:3002`.

## Key files
- `backend/src/routes/game.js`: all game logic and routes. Top of file holds helpers: `allowFields`, `requireSessionMember`, `broadcast`, `getTrustedSchedule`, validators.
- `backend/src/middleware/auth.js`: `authMiddleware`, `requireAdmin`, `verifyTokenAndLoadUser`
- `backend/src/server.js`: CORS allowlist, Socket.IO auth middleware, `join-session` only
- `backend/src/services/liveScores.js`: CricAPI client, the trusted result source
- `backend/src/services/adminBootstrap.js`: `ADMIN_USERNAMES` env var, applied at startup and at registration
- `backend/src/db/database.js`: schema and in-place migrations (`ALTER TABLE` guarded by `PRAGMA table_info`)
- `backend/src/db/iplData.js`: teams and the static IPL 2026 schedule
- `frontend/src/context/GameContext.jsx`: API calls and socket listeners
- `frontend/src/pages/AdminPage.jsx` (`#/admin`): enter official results without being in a game. Backed by `GET /api/game/admin/matches`.
- `frontend/src/components/UI.jsx`: shared UI. `Modal` renders through a portal because `.animate-fade-in` leaves a `transform` that breaks `position: fixed`.
- `SECURITY_AUDIT.md`: findings, fixes and the remaining assumptions

## Security rules (do not regress)
These were added after an audit. Several were exploitable before. Keep them true in every change:
1. **The client never decides match results.** Outcomes come only from `getTrustedSchedule()`: the static schedule, the CricAPI feed, or `official_results` set by an admin. `/process-match` accepts only `{ sessionId, matchId }`.
2. **Every route that takes a `sessionId` uses `requireSessionMember`** (403 for non-members) and checks the session `status` allowed for that action.
3. **Identity comes only from the JWT,** re-loaded from the DB. Never read `userId`, `username` or `role` from a body, query, URL or socket payload. Bodies use `allowFields([...])`.
4. **Sockets are authenticated in the handshake** (`auth: { token }`). Clients may only `join-session` (membership checked) and `leave-session`. Every game event is emitted by the server via `broadcast(req, ...)` after the DB write commits. Never add client-to-server game events.
5. **Multi-step writes go inside `db.transaction()`.** Broadcast after the transaction returns, never inside it.
6. **Admin = `users.role = 'admin'` in the DB,** checked by `requireAdmin`. The role is set only by `setup.js` or the server's `ADMIN_USERNAMES` env var, never from a request. Official results cannot be overwritten through the API.
7. `ALLOW_TEST_HELPER` must stay false in production.

## Testing
`security-tests/attack.js` runs about 34 attack and functional checks against a local server. See `security-tests/README.md`. Run it after any backend change; every line should say `SECURE`.
Use a throwaway database: `rm -rf backend/data` first, and start the server with `PORT=3101 ALLOW_TEST_HELPER=true`. Pass the same `ADMIN_USERNAMES` to the server and the harness to include the admin-bootstrap checks.
No unit test framework yet. Adding one (e.g. `node:test` + supertest) is welcome.

## Deploy
- **Backend (Render):** root `backend`, build `npm install`, start `npm start`. Env: `JWT_SECRET`, `FRONTEND_URLS` (origins only, e.g. `https://abhilashstack-00.github.io`), `ADMIN_USERNAMES` (the owner's username; free tier has no shell for `setup.js`), optional `LIVE_MATCH_PROVIDER=cricapi` + `CRICAPI_KEY`.
- **Frontend:** `frontend/.env.production` needs `VITE_API_URL` and `VITE_SOCKET_URL` set to the Render URL. GitHub Pages currently serves the **built** `index.html` + `assets/` from the repo root on `main`. After a frontend change, rebuild and replace the root `assets/` and `index.html`, or move to a GitHub Actions deploy.
- Deploy backend and frontend together. The old frontend sends winners, which the new backend rejects.

## Status (as of 21 Nov 2026)
- The security upgrade is **live** (pushed 21 Nov 2026 as `619e531`). Render runs it with `JWT_SECRET`, `ADMIN_USERNAMES`, `FRONTEND_URLS` and `ALLOW_TEST_HELPER=false`; GitHub Pages serves the rebuilt frontend.
- The admin page (`#/admin`) was added afterwards. The owner registers their admin account after every Render restart (the DB is wiped).
- Next steps, in order:
  1. **Stop data loss:** Render's free-tier disk is ephemeral, so the SQLite file (accounts, games, admin roles) is wiped on restart or redeploy. Move to a hosted DB. Turso/libSQL is closest to SQLite; Supabase or Neon are Postgres options.
  2. **Gameplay fixes:** points/wins live on `users` globally instead of per session (admin accounts also show on the leaderboard). The home-team "bidding war" path is unreachable: the first pick is assigned immediately. Either player leaving ends the session for both.
  3. **UX:** a "waking up the server" screen for Render cold starts (30-60 s). Remove the dev instructions from the fallback text in root `index.html`. Accessibility: only the admin page, header admin link and `Modal` have aria attributes so far.
  4. Rate limiting on login and register.
  5. `npm audit` lists advisories in backend dependencies (express/body-parser, qs, socket.io/ws). Most are fixed by a non-breaking `npm audit fix`; rerun the security tests after.

## Conventions
- Keep diffs focused. Don't rewrite unrelated code or add dependencies without a reason.
- Match the existing style: 2-space indent, single quotes. No semicolons in the frontend; semicolons in the backend.
- Explain changes in plain language. The owner is learning and wants to understand the reasoning.
