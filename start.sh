#!/usr/bin/env bash
# ============================================================================
#  Shortlist BOT - start everything with one command (macOS / Linux / Git Bash).
#
#    ./start.sh                start on this computer only (http://localhost:5870)
#    ./start.sh remote         also accept other devices (phone over Tailscale / Wi-Fi).
#                              Requires ACCESS_PASSCODE in backend/.env.
#    ./start.sh silent         do not open a browser
#
#  Starts, only if not already running: built-in database (if you use it), Ollama,
#  the API (5871) and the app (5870). Logs go to ./logs, process ids to ./.run
# ============================================================================
set -u
cd "$(dirname "$0")"
ROOT="$(pwd)"

REMOTE=0; SILENT=0
for a in "$@"; do
  case "$a" in remote) REMOTE=1 ;; silent) SILENT=1 ;; esac
done

say() { printf '  %s\n' "$*"; }
fail() { say "[x] $*"; exit 1; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_http() { # url, seconds
  local i=0
  while [ "$i" -lt "$2" ]; do
    if command -v curl >/dev/null 2>&1 && curl -fs -o /dev/null --max-time 2 "$1"; then return 0; fi
    sleep 2; i=$((i + 2))
  done
  return 1
}
launch() { # name, dir, command...
  local name="$1" dir="$2"; shift 2
  ( cd "$dir" && nohup "$@" >> "$ROOT/logs/$name.log" 2>&1 & echo $! > "$ROOT/.run/$name.pid" )
}

echo; say "Shortlist BOT"; say "-------------"

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Get it from https://nodejs.org and run this again."

if [ ! -f backend/.env ]; then
  say "[i] First run: creating your settings files..."
  node backend/scripts/init-env.js
  echo; say "Open backend/.env, set DATABASE_URL for your database, then run ./start.sh again."
  say "See SETUP.md if you are not sure what to put there."
  exit 1
fi

[ -d backend/node_modules ]  || { say "[i] Installing backend packages (first run only)...";  (cd backend && npm install); }
[ -d frontend/node_modules ] || { say "[i] Installing frontend packages (first run only)..."; (cd frontend && npm install); }
mkdir -p logs .run

if [ "$REMOTE" = 1 ]; then
  grep -Eq '^ACCESS_PASSCODE=.+' backend/.env || fail "Remote mode needs a login. Set ACCESS_PASSCODE (a long passphrase) in backend/.env, then run this again. Without it anyone who reaches the app could use your Gmail."
  export SHORTLIST_REMOTE=1
fi

# built-in database: only needed when DATABASE_URL uses port 5872
if grep -q ':5872/' backend/.env; then
  if listening 5872; then say "[=] Database already running"; else
    [ -d Setup/node_modules ] || (cd Setup && npm install)
    say "[+] Starting the built-in database..."
    launch db Setup node pglite-server.js
    for _ in $(seq 1 40); do listening 5872 && break; sleep 1; done
  fi
fi

# Ollama (optional)
if listening 11434; then say "[=] Ollama already running"; elif command -v ollama >/dev/null 2>&1; then
  say "[+] Starting Ollama..."; launch ollama "$ROOT" ollama serve
else say "[!] Ollama not found. Jobs cannot be analyzed until you install it (https://ollama.com)."; fi

if listening 5871; then say "[=] API already running"; else say "[+] Starting the API...";  launch backend backend npm run start:dev; fi
if listening 5870; then say "[=] App already running"; else say "[+] Starting the app..."; launch frontend frontend npm run dev; fi

say "[.] Waiting for everything to be ready..."
wait_http "http://127.0.0.1:5871/api/health" 120 || fail "The API did not start. See logs/backend.log"
wait_http "http://localhost:5870" 60 || fail "The app did not start. See logs/frontend.log"

echo; say "[ok] Shortlist BOT is running."
say "     On this computer:  http://localhost:5870"
if [ "$REMOTE" = 1 ]; then
  say "     Remote access is ON (login required). From your phone use one of:"
  command -v tailscale >/dev/null 2>&1 && tailscale ip -4 2>/dev/null | head -1 | while read -r ip; do say "       http://$ip:5870   (Tailscale - permanent)"; done
  { hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null; } | tr ' ' '\n' | grep -E '^[0-9]+\.' | while read -r ip; do say "       http://$ip:5870   (same Wi-Fi only)"; done
fi
say "     Stop it with ./stop.sh"

if [ "$SILENT" = 0 ]; then
  if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:5870 >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open http://localhost:5870 >/dev/null 2>&1 &
  fi
fi
