#!/usr/bin/env bash
# ============================================================================
#  Shortlist BOT - update this folder to the latest version from GitHub (macOS / Linux).
#  Run ./start.sh yourself afterwards (with whatever options you normally use).
#
#  Safe to run any time, safe to re-run if something fails partway through.
#  Your backend/.env, frontend/.env, uploaded CVs and database are never touched.
# ============================================================================
set -u
cd "$(dirname "$0")"

say() { printf '  %s\n' "$*"; }
fail() { echo; say "[x] $*"; exit 1; }

echo; say "Shortlist BOT - Update"; say "----------------------"

command -v git >/dev/null 2>&1 || fail "Git is not installed, so this folder cannot be updated automatically. Install it (macOS: xcode-select --install, or https://git-scm.com) and run ./update.sh again, or download the latest version yourself from https://github.com/maiz-an/Shortlist-BOT/releases/latest"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "This folder is not a Git checkout, so it cannot be updated automatically. Download the latest version yourself from https://github.com/maiz-an/Shortlist-BOT/releases/latest"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Get it from https://nodejs.org and run ./update.sh again."

say "[i] Stopping Shortlist BOT if it is running..."
./stop.sh >/dev/null 2>&1

if ! git diff --quiet --exit-code -- backend frontend scripts *.cmd *.sh 2>/dev/null; then
  say "[!] You have edited some of Shortlist BOT's own files. They are left as they are;"
  say "    only files that changed on GitHub are updated. backend/.env, frontend/.env"
  say "    and everything under storage/ are never touched by this either way."
fi

say "[i] Downloading the latest version..."
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ -n "$BRANCH" ] || fail "Could not work out which branch this checkout is on. If you cloned this normally you should not see this - ask for help."
git fetch origin || fail "Could not reach GitHub to check for updates. Check your internet connection and try again."
git pull --ff-only origin "$BRANCH" || fail "The update could not be applied automatically - this copy has local commits that differ from GitHub. If you did not intend to change any of Shortlist BOT's own files, the simplest fix is to download it fresh from https://github.com/maiz-an/Shortlist-BOT/releases/latest and move your backend/.env, frontend/.env and storage/ folder into it."

say "[i] Updating backend packages..."
( cd backend && npm install ) || fail "Installing backend packages failed. Scroll up for the error, fix it (often a network problem), then run ./update.sh again."

# The generated database client file can stay briefly locked (e.g. another process still
# had it open) right after Shortlist BOT stops - retry a few times before giving up.
GEN_OK=0
for _ in 1 2 3 4 5; do
  if ( cd backend && npx prisma generate >/dev/null 2>&1 ); then GEN_OK=1; break; fi
  sleep 3
done
[ "$GEN_OK" = 1 ] || { ( cd backend && npx prisma generate ); fail "Preparing the database client failed - its file may still be locked by another running copy of Shortlist BOT. Make sure it is fully closed and run ./update.sh again."; }
# Best-effort: the built-in database cannot run real migrations, only Shortlist BOT's own
# additive changes on next start (see backend/src/prisma/prisma.service.ts). A real
# PostgreSQL database gets this applied properly; either way this step is not fatal.
( cd backend && npm run db:deploy ) >/dev/null 2>&1 || true

say "[i] Updating app packages..."
( cd frontend && npm install ) || fail "Installing app packages failed. Scroll up for the error, fix it (often a network problem), then run ./update.sh again."

echo
NEWVER="$(cat VERSION 2>/dev/null || echo unknown)"
say "[OK] Updated to version $NEWVER."
say "     What changed: https://github.com/maiz-an/Shortlist-BOT/blob/main/CHANGELOG.md"
echo; say "Run ./start.sh when you are ready to start it again."
