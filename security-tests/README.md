# Security regression tests

Attacks a locally running backend and prints `SECURE` / `VULNERABLE` per check, plus
functional checks (`[functional]`) proving normal play still works.

```bash
# terminal 1 (use a throwaway DB: this creates users and sessions)
cd backend
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
rm -rf data && PORT=3101 ALLOW_TEST_HELPER=true node src/server.js

# terminal 2 (same JWT_SECRET; needed to mint an expired / forged-claim token)
cd security-tests && npm install
JWT_SECRET=<same value> SETUP_JS=../setup.js npm test
```

Never run this against production: it needs `ALLOW_TEST_HELPER=true` and promotes a test user to admin.
