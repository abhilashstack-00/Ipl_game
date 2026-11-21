# Security audit and hardening: IPL Strategy Arena

Scope: `backend/src/**`, the Socket.IO layer, and the frontend code that talks to them.
Method: source review, plus an attack harness (`security-tests/attack.js`) run against the real server before and after the changes.

| | Before | After |
|---|---|---|
| Attack checks passing | 10 / 21 | 29 / 29 (incl. functional regression checks) |

This report does **not** claim the system is secure in general. It claims that the specific attacks below were reproduced against the original code and are blocked by the new code, and it lists what could not be verified.

---

## 1. Findings: every place client-controlled input was trusted

Severity: **Critical** = breaks game integrity for any player. **High** = cross-session access or impersonation. **Medium/Low** = hardening.

| # | File | Function / route / event | Trusted input | Impact | Fix applied |
|---|---|---|---|---|---|
| 1 | `routes/game.js` | `POST /process-match` | `winnerTeamId`, `isDraw` | **Critical.** Any player declared any winner for any un-processed match and got +2 points. Reproduced. | Body allowlist rejects result fields. Outcome comes only from `getTrustedSchedule()` (seed, live feed, or admin record). |
| 2 | `frontend/.../MatchesPage.jsx` | `simulate()`, "Re-simulate", "Manual" | Browser `Math.random()` and button clicks | **Critical.** Re-roll until your team wins, then submit. | Removed. Players can only apply the official result; admin entry is shown to admins and enforced server-side. |
| 3 | `routes/game.js` | `POST /process-match` | `sessionId` | **High.** No membership check. Outsiders scored matches in other people's sessions. Reproduced. | `requireSessionMember` returns 403; also requires status `active`. |
| 4 | `routes/game.js` | `POST /finalize-auction` | `sessionId` | **High.** Outsiders could start anyone's season. A missing `auction_state` row also bypassed the "auction complete" check. Reproduced. | Membership + status `auction` required. Missing state is treated as "not complete". Conditional `UPDATE ... AND status='auction'`. |
| 5 | `routes/game.js` | `GET /matches/:sessionId` | URL `sessionId` | **High.** Outsiders read any session and triggered its result auto-apply (a GET that writes). Reproduced. | Membership check. Auto-apply only when the session is `active`, inside a transaction. |
| 6 | `routes/game.js` | `POST /match-choice` | Timing of `chosenTeamId` | **High.** When one player owns both teams, they could wait for the real result and then pick the winning side. Reproduced (HTTP 200). | Rejected once any trusted result exists or on/after match day (UTC). Status must be `active`. |
| 7 | `server.js` | `io.on('connection')` | Nothing (no auth) | **High.** Anyone on the internet could open a socket. Reproduced. | `io.use` middleware verifies the JWT in `handshake.auth.token` and confirms the user still exists. Identity is stored in `socket.data.user`. |
| 8 | `server.js` | `join-session` | `sessionId`, `userId`, `username` | **High.** Join any room, receive all its events, and broadcast "X joined" while impersonating X. Reproduced. | Payload identity ignored. DB membership check before `socket.join`. One room per socket. |
| 9 | `server.js` | `state-update`, `team-bought`, `home-team-selected`, `bid-placed`, `match-processed` | Entire payload | **High.** Clients broadcast arbitrary fake events, e.g. "HACKER earns 999 points". Reproduced. | Handlers deleted. Events are emitted by route handlers via `req.app.get('io')` after the DB write commits. |
| 10 | `middleware/auth.js` | `JWT_SECRET` fallback | n/a (config) | **High** if the env var was ever unset: tokens forgeable with the secret published in the repo. | No fallback. Startup fails if missing or a known placeholder. Algorithm pinned to HS256. User re-loaded from DB on every request. |
| 11 | `routes/game.js` | `POST /home-team` | `teamId` | **Medium.** Arbitrary strings became owned "teams". Allowed in any session status. Reproduced. | Validated against `IPL_TEAMS`. Status must be `waiting`/`auction`. |
| 12 | `routes/game.js` | `POST /bid`, `resolveActiveAuctionRound` | `amount`, `teamId` | **Medium.** Fractional and other non-integer bids accepted. The 5-team cap was never enforced in auction rounds. | Integer 1–100 only. Squad cap checked at bid time and at round resolution. Status must be `auction`. |
| 13 | `routes/game.js` | `POST /debug/seed-session` | `sessionId` | **Medium** when `ALLOW_TEST_HELPER=true`: reset any session's teams. | Membership required as well as the flag. |
| 14 | `server.js` | CORS `origin` callback | `Origin` header | **Low–Medium.** Fallback `callback(null, true)` allowed every origin with `credentials: true`. | Strict allowlist (defaults + `FRONTEND_URLS`). `credentials: false`, since auth is a Bearer header. |
| 15 | `routes/auth.js` | `register`, `login` | `username`, `password` types and lengths | **Low.** Non-string values caused 500s; 4-character passwords. | Type checks, field allowlist, username `^[A-Za-z0-9_]{3,24}$`, password 8–72 bytes. |
| 16 | `routes/game.js` | `POST /session/join` | `inviteCode` | **Low.** Untyped value went straight into a query (parameterized, so no injection). | String + format check; normalized to uppercase. |
| 17 | `routes/game.js` | `POST /session` | n/a | **Low.** `Math.random()` invite codes; a collision caused a 500. | `crypto.randomInt` with an unambiguous alphabet and collision retry. |
| 18 | `services/liveScores.js` | `parseWinner` | Third-party status string | **High (correctness of the trusted source).** "Mumbai Indians won the toss…" parsed as "MI won the match", and those points would have been auto-awarded. | Ignores `matchEnded === false` and any status mentioning the toss. |
| 19 | `routes/game.js` | `GET /live-status` | n/a | **Low.** Provider diagnostics exposed to every user. | Admin only. |
| 20 | all game routes | request bodies | Extra fields (`userId`, `role`, `credits`, …) | **Defense in depth.** None were used, but nothing stopped future code from reading them. | Per-route `allowFields([...])` returns 400 for unexpected fields. |
| 21 | `routes/game.js` | `GET /leaderboard` | n/a | **Low (privacy).** Any logged-in player could list every account on the site with their stats, including admin accounts. The frontend fetched it but never showed it. Found during the 21 Nov 2026 redesign. | Route and page removed; the harness checks it returns 404. |
| 22 | `frontend/.../AuthContext.jsx` | startup `/auth/me` | n/a | **Availability.** Any error, including a Render cold-start timeout, deleted the saved login. | Only a 401 logs the user out; `ServerGate` waits for `/api/health` first. |

### Database consistency
All multi-step writes now run inside `db.transaction()`: session create/join/leave, home-team selection, bidding and bid-war resolution, auction round resolution (`syncAuctionState`), finalize, match choice, result application, auto-apply, and seeding.

Socket events are emitted only after the transaction function returns. Two unique indexes back up the application checks: `match_results(session_id, match_id)` and `team_ownerships(session_id, team_id)`. WAL mode is kept, and `busy_timeout` is added.

### Admin model (new, minimal)
- `users.role` column (default `'player'`), added by migration.
- Promote with `node setup.js --admin <username>`; revoke with `--revoke-admin`.
- Or set the server env var `ADMIN_USERNAMES` (comma-separated, exact case). The server promotes listed users that already exist at startup, and gives `role = 'admin'` to a listed name when it registers. The list comes from the host's environment, never from a request. It only grants: removing a name does not demote. Tested: a listed name becomes admin, and a different-case lookalike stays a player.
- `requireAdmin` reads the role from the DB on every request. A `role` claim in a validly signed JWT, or in a request body, has no effect (tested).
- `POST /api/game/admin/match-result` records a global official result in a new `official_results` table. It accepts only past matches with no existing result and **cannot overwrite** one. Corrections require a deliberate DB edit.
- `GET /api/game/admin/matches` (admin only, read-only) lists every match as `needs-result`, `decided` (with its source: schedule, live feed or admin, and who entered it) or `upcoming`, plus live-feed diagnostics. It needs no session, so the admin page at `#/admin` works for an admin who is not playing. Tested: a player gets 403, and an admin in no game gets the list.

---

## 2. Remaining assumptions (not verifiable from this source)

1. **Single process, single SQLite file.** Atomicity relies on better-sqlite3 transactions in one Node process. Running multiple backend instances would need a shared database with its own locking.
2. **Data durability on Render free tier.** The filesystem is ephemeral, so the SQLite file, accounts, and admin roles can be wiped on redeploy or restart. This is mostly an availability issue, and a hosted database (Turso/libSQL, Neon, Supabase) fixes it. It has one security side effect with `ADMIN_USERNAMES`: after a wipe, the listed username is free again, and **whoever registers it first becomes admin**. Mitigations until the DB is persistent: pick an admin username that isn't obvious and isn't your normal player name, and register it right after every deploy or restart. If registering it says "Username already taken", someone else got it first: remove the name from `ADMIN_USERNAMES`, change to a new one, and redeploy. An admin can only add results for past matches that have none; it cannot overwrite existing ones.
3. **The result sources are trusted as-is.**
   - Seeded results in `db/iplData.js` (m01–m04) are hardcoded and were not checked against reality.
   - CricAPI is trusted over TLS. If its feed is wrong, wrong points are awarded.
4. **Tokens in `localStorage`.** Any XSS would expose JWTs. No `dangerouslySetInnerHTML`, `innerHTML`, or `eval` sinks were found in `frontend/src`, and React escapes text. Third-party scripts (Google Fonts CSS) were not audited.
5. **No token revocation.** JWTs live 7 days. Deleting a user invalidates their tokens immediately (the DB is checked), and role changes apply immediately, but a stolen token for an existing user stays valid until it expires.
6. **No rate limiting.** Login brute-force and mass registration are not throttled. Adding a limiter means a dependency (`express-rate-limit`) or custom code; it was left out per the "no unnecessary dependencies" rule.
7. **HTTPS** is assumed to be terminated by the host (Render / GitHub Pages).
8. **Match-choice lock uses UTC dates.** The schedule has no kickoff times, so sides lock at 00:00 UTC on match day. That is safe for IPL evening fixtures but coarse.
9. **Game-design behavior left unchanged** (not security bugs, noted for the backlog):
   - Either player leaving ends the session for both.
   - Points and wins are global per user rather than per session.
   - The home-team "bidding war" path is effectively unreachable: the first pick is assigned immediately, so the second player gets "Team already owned".
   - `seedTeamsForTesting` orders players by a 1-second-resolution timestamp, so seeded ownership is random.

---

## 3. Security test checklist

Automated in `security-tests/attack.js` (results from the final run):

| Scenario | Check | Result |
|---|---|---|
| Forged match winner | Player posts own team as winner | 400, rejected |
| Forged match winner | Pick a side after the result is known | 409 |
| Unauthorized session access | Outsider: GET matches / finalize / process | 403 ×3 |
| Forged userId | `userId` in HTTP body | 400 |
| Forged userId | Impersonated `userId`/`username` on socket join | no event emitted |
| Forged admin role | `role: 'admin'` in body; signed JWT with `role` claim; register with role | 403 / 403 / 400 |
| Invalid JWT | Garbage; old hardcoded secret; `alg: none` | 401 ×3 |
| Expired JWT | HTTP and socket | 401 / connection refused |
| Unauthorized socket connection | No token | connection refused |
| Unauthorized room join | Outsider listens on a session room | received nothing |
| Invalid state transitions | Bid after season start; fake team id; non-string id; fractional bid | 409 / 400 / 400 / 400 |
| Concurrent writes | 25 parallel `process-match` + 2 auto-apply GETs | 1 result row; user points = ledger points |
| Fake Socket.IO updates | Client emits `match-processed`, `state-update`, `team-bought` | nothing relayed |
| Admin path (functional) | Admin sets result; overwrite attempt; result applied to session | 200 / 409 / applied |
| Normal play (functional) | Join, home teams, bid | all 200 |

Manual checks worth doing after deploy:
- [ ] Production refuses to start without `JWT_SECRET` (it should crash with a clear message).
- [ ] `ALLOW_TEST_HELPER` is unset or `false` in production.
- [ ] A browser on an unlisted origin cannot call the API (CORS).
- [ ] Two browsers: an auction bid in one shows a toast in the other (server-emitted events work through the host's proxy).
