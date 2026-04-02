# Deployment Workflow & Branching Strategy

## Overview
This document explains how to safely develop, test, and deploy changes without breaking the live website.

---

## Branch Strategy

### Main Branches

| Branch | Purpose | Deploys To | Auto-Deploy |
|--------|---------|-----------|-------------|
| `main` | **PRODUCTION** - Live website | GitHub Pages (prod) + Render (prod) | ✅ Yes |
| `develop` | **Development** - Staging/testing | Local dev only | No |
| `feature/*` | **Feature branches** - Individual features | Local dev only | No |

---

## Workflow: Adding & Testing Changes

### Step 1: Create a Feature Branch (from `develop`)
```bash
# Start from develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/your-feature-name
# Example: feature/add-live-scores, feature/fix-timer-sync
```

### Step 2: Make Changes & Commit
```bash
# Edit files as needed
# ... make your changes ...

# Commit
git add .
git commit -m "Describe what changed"
```

### Step 3: Test Locally (Full Stack)
```bash
# From project root
npm run dev:open
```
This starts:
- ✅ Backend on `http://localhost:3002` (local)
- ✅ Frontend on `http://localhost:5173` (local, Vite dev server)
- ✅ Auto-opens browser

**Test thoroughly:**
- Create account
- Login
- Run auction
- Check timers
- Test on mobile (use browser DevTools: Ctrl+Shift+M)
- Check console for errors (F12)

### Step 4: Push Feature Branch & Create Pull Request
```bash
# Push branch
git push origin feature/your-feature-name

# Go to GitHub and create Pull Request
# - Title: Clear description
# - Description: What changed and why
# - Assign to yourself
```

### Step 5: Review & Merge to Develop
```bash
# After review approval, merge to develop
git checkout develop
git pull origin develop
git merge feature/your-feature-name
git push origin develop
```

---

## Testing Options

### Option 1: Local Testing (FREE, Recommended)
- ✅ Fastest feedback
- ✅ Works offline
- ✅ Can test multiple devices on same network

**Steps:**
```bash
npm run dev:open
# Test in browser at http://localhost:5173
# Test on phone: http://<your-computer-ip>:5173
```

---

### Option 2: Staging Deployment (Optional, for Production-like Testing)

Create a **staging environment** that mirrors production setup but is separate:

#### Setup Staging Backend on Render (One-time)
1. Go to https://render.com
2. Create **new** Web Service (don't redeploy existing)
3. Connect same GitHub repo
4. Name: `ipl-game-backend-staging`
5. Runtime: Node
6. Build: `npm install`
7. Start: `npm start`
8. Environment variables: Same as prod (copy from production service)
9. Deploy

**Note backend URL:** `https://ipl-game-backend-staging.onrender.com`

#### Deploy Frontend to Staging Branch
```bash
# This creates a separate GitHub Pages for testing
git checkout develop
npm run build

# Deploy to staging branch (keeps main untouched)
npx gh-pages -d frontend/dist -b gh-pages-staging
```

Then test at: `https://abhilashstack-00.github.io/Ipl_game/?branch=staging`
(Note: You'll need to manually update the API URL in staging)

---

### Option 3: Test Against Production Backend (SIMPLEST FOR YOU)
```bash
# Use production backend, local frontend
# Edit frontend/.env or frontend/vite.config.js to point to prod backend:
# VITE_BACKEND_URL=https://ipl-game-backend.onrender.com

npm run dev:open
```

---

## Deployment: Develop → Main → Production

### When Ready to Deploy to Production
```bash
# Merge develop into main
git checkout main
git pull origin main
git merge develop
git push origin main
```

**Auto-deploys to:**
- ✅ GitHub Pages frontend (live immediately)
- ✅ Render backend (live in 2-3 minutes)

---

## Hotfix: Urgent Production Bug

If production is broken and you need to fix it immediately:

```bash
# Create hotfix from main
git checkout main
git checkout -b hotfix/critical-bug-name

# Make minimal fix
# ... edit files ...

# Test locally
npm run dev:open

# Merge back to main
git add .
git commit -m "Critical hotfix: description"
git push origin hotfix/critical-bug-name

# On GitHub, merge hotfix → main (deploys immediately)

# Then merge main → develop (so develop is in sync)
git checkout develop
git pull origin main
git push origin develop
```

---

## Git Commands Reference

```bash
# See all branches
git branch -a

# Switch branches
git checkout branch-name

# Create and switch
git checkout -b new-branch-name

# Delete local branch
git branch -d branch-name

# Delete remote branch
git push origin --delete branch-name

# See recent commits
git log --oneline -10

# See changes before committing
git diff

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1
```

---

## Checklist Before Deploying to Production

- [ ] Feature branch created from `develop`
- [ ] All changes committed
- [ ] Local testing completed (`npm run dev:open`)
- [ ] Mobile responsive design tested (DevTools Ctrl+Shift+M)
- [ ] No console errors (F12)
- [ ] No network errors
- [ ] Pull request created and reviewed
- [ ] Tests pass (if CI/CD set up)
- [ ] Merged to `develop`
- [ ] Final review in `develop` branch
- [ ] Merged to `main` for production deployment
- [ ] Production deployment verified (hard refresh Ctrl+F5)

---

## Common Issues & Solutions

### "My local site has an error but I don't want to push it to production"
**Solution:** Your error is only local until you push. Always push to `feature/...` first, review, then merge develop → main.

### "How do I test changes on mobile?"
**Solution:** 
```bash
# Get your computer IP
ipconfig /all  # Look for IPv4 Address

# On mobile (same WiFi), open
http://<your-computer-ip>:5173
```

### "Main branch has an error and production is broken"
**Solution:**
1. Create `hotfix/...` from `main`
2. Fix the bug
3. Test locally
4. Merge hotfix → main (production fixes immediately)
5. Merge main → develop (keep branches in sync)

### "How do I see what changed?"
```bash
git diff main develop   # See all changes between branches
git log --oneline       # See commit history
```

---

## Recommended Schedule

- **Daily:** Work on `feature/*` branches, test locally
- **Before EOD:** Push feature branch to GitHub
- **Next day:** Review, approve, merge to `develop`
- **Weekly:** Full test cycle on `develop`, then merge to `main` for production
- **Emergencies:** Use hotfix branches for immediate production fixes

---

## Next Steps

1. ✅ Make sure you're on `main` branch (production current state)
2. ✅ Create `develop` branch: `git checkout -b develop && git push origin develop`
3. ✅ All future changes go to `feature/*` branches
4. ✅ Review locally before pushing
5. ✅ Only merge to `main` when fully tested
