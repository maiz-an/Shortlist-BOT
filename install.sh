#!/usr/bin/env bash
# ============================================================================
#  Shortlist BOT - first-time setup for a Mac (or Linux box) with nothing
#  installed yet. Run:  chmod +x install.sh && ./install.sh
#  It installs what is missing (Homebrew + Node.js + Git on Mac; best-effort
#  on Linux), sets up your database and .env files, and asks how you want AI
#  to run.
#
#  Safe to run more than once - every step only does something if it is not
#  already done. Nothing here touches an existing backend/.env or frontend/.env.
# ============================================================================
set -u
cd "$(dirname "$0")"

say() { printf '  %s\n' "$*"; }
fail() { echo; say "[x] $*"; exit 1; }

echo; say "Shortlist BOT - First-time setup"; say "---------------------------------"; echo

OS="$(uname -s)"

# --- Homebrew (macOS only - the one package manager used for everything below) ---
if [ "$OS" = "Darwin" ] && ! command -v brew >/dev/null 2>&1; then
  say "[+] Installing Homebrew (macOS's package manager)..."
  say "    On a brand-new Mac this also installs Apple's Command Line Tools - a system window"
  say "    may pop up asking you to install them. Click Install and wait; this can take a"
  say "    few minutes and needs no input from you beyond that click."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || fail "Installing Homebrew failed. Install it yourself from https://brew.sh and run ./install.sh again."
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"
  fi
  command -v brew >/dev/null 2>&1 || fail "Homebrew was installed but this window cannot see it yet. Close this Terminal window, open a new one, and run ./install.sh again."
fi

# --- Node.js -----------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  say "[+] Installing Node.js..."
  if [ "$OS" = "Darwin" ]; then
    brew install node || fail "Installing Node.js failed. Install it yourself from https://nodejs.org and run ./install.sh again."
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y nodejs npm || fail "Installing Node.js failed. Install it yourself from https://nodejs.org and run ./install.sh again."
  else
    fail "Node.js is not installed and could not be installed automatically here. Install it from https://nodejs.org and run ./install.sh again."
  fi
else
  say "[=] Node.js is already installed."
fi

# --- Git -----------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  say "[+] Installing Git..."
  if [ "$OS" = "Darwin" ]; then
    brew install git || say "[!] Installing Git failed (not fatal - Shortlist BOT itself does not need it, only update.sh does). Install it later from https://git-scm.com"
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y git || say "[!] Installing Git failed (not fatal). Install it later from https://git-scm.com"
  else
    say "[!] Git is not installed and could not be installed automatically here. update.sh needs it later; get it from https://git-scm.com"
  fi
else
  say "[=] Git is already installed."
fi

# --- Make sure update.sh will work later (a ZIP download isn't a Git checkout) ---
if command -v git >/dev/null 2>&1 && [ -f VERSION ] && ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say "[+] This looks like a ZIP download rather than a Git checkout, so update.sh could"
  say "    not update it later. Turning it into one now (none of your files are touched)..."
  git init -q -b main
  git remote add origin https://github.com/maiz-an/Shortlist-BOT.git
  if git fetch -q origin main; then
    git reset -q --hard origin/main
    say "[OK] This folder can now be updated with update.sh."
  else
    say "[!] Could not reach GitHub to finish this. update.sh will not work until you retry"
    say "    install.sh with an internet connection."
    rm -rf .git
  fi
fi

# --- Settings files ------------------------------------------------------------
FIRST_RUN=0
[ -f backend/.env ] || FIRST_RUN=1
say "[i] Setting up .env files..."
node backend/scripts/init-env.js
[ -f backend/.env ] || fail "Could not create backend/.env. See the message above."

command -v python3 >/dev/null 2>&1 || fail "python3 is not available, so backend/.env cannot be edited safely. This is unusual (Homebrew normally requires it) - install it (e.g. brew install python3) and run ./install.sh again."

# setenvfile FILE KEY VALUE - sets KEY=VALUE in FILE, uncommenting it if needed, or adding it
# if it is not there at all. Never touches any other line.
setenvfile() {
  python3 - "$1" "$2" "$3" <<'PYEOF'
import re, sys
file, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
with open(file) as f:
    text = f.read()
pat = re.compile(r'^#?\s*' + re.escape(key) + r'=.*$', re.M)
if pat.search(text):
    text = pat.sub(key + '=' + val, text)
else:
    text = text.rstrip('\n') + '\n' + key + '=' + val + '\n'
with open(file, 'w') as f:
    f.write(text)
PYEOF
}

# setenv KEY VALUE - same as setenvfile, against backend/.env.
setenv() { setenvfile backend/.env "$1" "$2"; }

if [ "$FIRST_RUN" = 1 ]; then
  # Brand new install: default to the built-in database, so nothing else needs installing.
  # (An existing .env is never changed - see backend/.env.example for real PostgreSQL instead.)
  setenv DATABASE_URL '"postgresql://postgres:postgres@127.0.0.1:5872/postgres?schema=public&connection_limit=1&sslmode=disable&pgbouncer=true"'
  say "[i] Using the database built into Shortlist BOT (nothing separate to install)."
  say "    To use your own PostgreSQL instead, edit DATABASE_URL in backend/.env - see SETUP.md."
fi

# --- Packages --------------------------------------------------------------------
say "[i] Installing backend packages (first run only)..."
( cd backend && npm install ) || fail "Installing backend packages failed. See the messages above."
say "[i] Installing app packages (first run only)..."
( cd frontend && npm install ) || fail "Installing app packages failed. See the messages above."

# --- AI choice ---------------------------------------------------------------------
echo
say "How should Shortlist BOT run its AI?"
say "  1. I have an API key for a cloud AI (OpenAI, OpenRouter, Groq, Together.ai, ...)"
say "  2. Use a free local AI model with Ollama (needs a reasonably capable Mac)"
read -r -p "Type 1 or 2 and press Enter [2]: " AI_CHOICE
AI_CHOICE="${AI_CHOICE:-2}"

if [ "$AI_CHOICE" = "1" ]; then
  echo
  read -r -p "Paste your API key: " AI_KEY
  if [ -z "$AI_KEY" ]; then
    say "[!] No key entered - staying on Ollama for now. Re-run ./install.sh any time to switch."
  else
    read -r -p "API base URL [https://api.openai.com/v1]: " AI_BASE
    AI_BASE="${AI_BASE:-https://api.openai.com/v1}"
    read -r -p "Model name [gpt-4o-mini]: " AI_MODELNAME
    AI_MODELNAME="${AI_MODELNAME:-gpt-4o-mini}"
    setenv AI_PROVIDER openai
    setenv AI_API_BASE_URL "$AI_BASE"
    setenv AI_API_KEY "$AI_KEY"
    setenv AI_API_MODEL "$AI_MODELNAME"
    say "[OK] Cloud AI configured ($AI_MODELNAME via $AI_BASE)."
  fi
else
  setenv AI_PROVIDER ollama
  if ! command -v ollama >/dev/null 2>&1; then
    if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
      say "[+] Installing Ollama..."
      brew install ollama || say "[!] Installing Ollama failed. Install it yourself from https://ollama.com and run ./install.sh again."
    elif [ "$OS" != "Darwin" ]; then
      say "[+] Installing Ollama..."
      curl -fsSL https://ollama.com/install.sh | sh || say "[!] Installing Ollama failed. Install it yourself from https://ollama.com and run ./install.sh again."
    else
      say "[!] Ollama is not installed. Install it yourself from https://ollama.com, then run ./install.sh again to pick a model for your Mac."
    fi
  fi
  if command -v ollama >/dev/null 2>&1; then
    RAM_GB=8
    if [ "$OS" = "Darwin" ]; then
      RAM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 8589934592) / 1073741824 ))
    elif [ -r /proc/meminfo ]; then
      RAM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1048576 ))
    fi
    OLLAMA_PICK="qwen3:8b"
    [ "$RAM_GB" -le 6 ] && OLLAMA_PICK="qwen3:1.7b"
    [ "$RAM_GB" -ge 7 ] && OLLAMA_PICK="qwen3:4b"
    [ "$RAM_GB" -ge 12 ] && OLLAMA_PICK="qwen3:8b"
    [ "$RAM_GB" -ge 20 ] && OLLAMA_PICK="qwen3:14b"
    say "[i] This Mac has about ${RAM_GB} GB of RAM - picking $OLLAMA_PICK."
    say "[i] Downloading the model (a few GB, only happens once)..."
    if ollama pull "$OLLAMA_PICK"; then
      setenv OLLAMA_MODEL "$OLLAMA_PICK"
      say "[OK] Ollama configured with $OLLAMA_PICK."
    else
      say "[!] Could not download $OLLAMA_PICK right now. Shortlist BOT will still start;"
      say "    run \"ollama pull $OLLAMA_PICK\" yourself later, or check the AI card in Settings."
    fi
  fi
fi

# --- WhatsApp alerts (optional) --------------------------------------------------
echo
if [ -f services/openwa/package.json ]; then
  say "[=] WhatsApp alerts (OpenWA) are already set up."
else
  say "Want WhatsApp alerts too? Shortlist BOT can message you on WhatsApp when a job"
  say "matches. This needs a spare WhatsApp number - never use your main one (see SETUP.md"
  say "for why) - and downloads its own small Chrome browser to talk to WhatsApp Web."
  read -r -p "Set it up now? [y/N]: " WA_CHOICE
  case "$WA_CHOICE" in
    [yY]*)
      if ! command -v git >/dev/null 2>&1; then
        say "[!] Git is needed for this and is not installed. Skipping - see SETUP.md to do this later."
      else
        say "[+] Downloading OpenWA..."
        if ! git clone --quiet https://github.com/rmyndharis/OpenWA.git services/openwa; then
          say "[!] Could not download OpenWA (check your internet connection). Skipping - see SETUP.md to do this later."
        else
          cp services/openwa/.env.minimal services/openwa/.env
          say "[+] Installing OpenWA packages (this can take a few minutes)..."
          if ! ( cd services/openwa && npm ci ); then
            say "[!] Installing OpenWA packages failed. See the messages above; see SETUP.md to finish this later."
          else
            say "[+] Downloading OpenWA's browser (a few hundred MB, only happens once)..."
            ( cd services/openwa && npx puppeteer browsers install chrome )
            WA_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
            setenvfile services/openwa/.env HOST 127.0.0.1
            setenvfile services/openwa/.env API_MASTER_KEY "$WA_KEY"
            setenv OPENWA_URL http://127.0.0.1:2785
            setenv OPENWA_API_KEY "$WA_KEY"
            say "[OK] WhatsApp alerts installed. Once Shortlist BOT is running, open Settings > WhatsApp"
            say "     and scan the QR code with WhatsApp on your phone (Settings > Linked devices > Link a device)."
          fi
        fi
      fi
      ;;
  esac
fi

echo; say "[OK] Setup finished."; echo
read -r -p "Start Shortlist BOT now? [Y/n]: " GOSTART
case "$GOSTART" in
  [nN]*) say "Run ./start.sh whenever you are ready."; exit 0 ;;
esac
exec ./start.sh
