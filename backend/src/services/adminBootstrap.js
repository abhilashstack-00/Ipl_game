// Admins configured by the server operator through the ADMIN_USERNAMES env var.
//
// Why this exists: on Render's free tier there is no shell to run `node setup.js --admin`,
// and the SQLite file is wiped on every restart. This lets the operator say "these usernames
// are admins" once, in the host's environment, and the server re-applies it to the DB.
//
// The role still lives only in users.role and is still checked by requireAdmin on every request.
// It is never read from a client: the list comes from the server's environment.
//
// This only GRANTS admin. Removing a name from the list does not demote that user in an
// existing DB; use `node setup.js --revoke-admin <username>` (or let the DB be reset).

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function parseAdminUsernames(raw) {
  const names = new Set();
  for (const part of String(raw || '').split(',')) {
    const name = part.trim();
    if (!name) continue;
    if (!USERNAME_RE.test(name)) {
      console.warn('[admin] Ignoring an invalid entry in ADMIN_USERNAMES (must be 3-24 letters, numbers or underscores).');
      continue;
    }
    names.add(name);
  }
  return names;
}

const ADMIN_USERNAMES = parseAdminUsernames(process.env.ADMIN_USERNAMES);

// Exact, case-sensitive match, the same way usernames are stored and compared in the DB.
function isConfiguredAdmin(username) {
  return ADMIN_USERNAMES.has(username);
}

// Promote listed users that already exist. Called once at startup.
function promoteConfiguredAdmins(db) {
  if (ADMIN_USERNAMES.size === 0) return 0;
  const promote = db.prepare("UPDATE users SET role = 'admin' WHERE username = ? AND role != 'admin'");
  const promoted = db.transaction((names) => {
    let changed = 0;
    for (const name of names) changed += promote.run(name).changes;
    return changed;
  })([...ADMIN_USERNAMES]);
  // Log counts only, so admin usernames do not end up in host logs.
  console.log(`[admin] ADMIN_USERNAMES lists ${ADMIN_USERNAMES.size} account(s); promoted ${promoted} existing user(s).`);
  return promoted;
}

module.exports = { isConfiguredAdmin, promoteConfiguredAdmins, parseAdminUsernames };
