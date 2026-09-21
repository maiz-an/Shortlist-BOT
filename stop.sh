#!/usr/bin/env bash
# Shortlist BOT - stop the app, the API and the built-in database.
# Ollama is left running (other programs may use it). Use "./stop.sh all" to stop it too.
cd "$(dirname "$0")"
echo; echo "  Stopping Shortlist BOT..."

stop_port() {
  local pids=""
  if command -v lsof >/dev/null 2>&1; then pids="$(lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null)"
  elif command -v fuser >/dev/null 2>&1; then pids="$(fuser "$1"/tcp 2>/dev/null)"; fi
  [ -n "$pids" ] && kill $pids 2>/dev/null
}

for f in .run/frontend.pid .run/backend.pid .run/db.pid; do
  [ -f "$f" ] && { pkill -P "$(cat "$f")" 2>/dev/null; kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; }
done
for p in 5870 5871 5872; do stop_port "$p"; done

if [ "${1:-}" = "all" ]; then
  [ -f .run/ollama.pid ] && { kill "$(cat .run/ollama.pid)" 2>/dev/null; rm -f .run/ollama.pid; }
  pkill -x ollama 2>/dev/null
  echo "  Ollama stopped."
fi
echo "  Done."
