# Security regression tests

Attacks a locally running backend and prints `SECURE` / `VULNERABLE` per check, plus
functional checks (`[functional]`) proving normal play still works.

```bash
# terminal 1 (use a throwaway DB: this creates users and sessions)
cd backend
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
rm -rf data && PORT=3101 ALLOW_TEST_HELPER=true TEST_ROUND_SECONDS=2 ADMIN_USERNAMES=Env_Admin1 node src/server.js

# terminal 2 (same JWT_SECRET; needed to mint an expired / forged-claim token)
cd security-tests && npm install
JWT_SECRET=<same value> SETUP_JS=../setup.js ADMIN_USERNAMES=Env_Admin1 npm test
```

`ADMIN_USERNAMES` is optional. When both sides get the same value, two extra checks run: the listed name
is admin after it registers, and a different-case lookalike is not. The name is fixed, so this needs a fresh DB.

`TEST_ROUND_SECONDS=2` makes auction rounds 2 seconds long (it only works together with `ALLOW_TEST_HELPER=true`).
With it, four extra checks play a short auction: once one squad is full the rest go to the other player at base
price (credits never below 0), no more bids are accepted, and the season can start. Without it they are skipped.

Never run this against production: it needs `ALLOW_TEST_HELPER=true` and promotes a test user to admin.
