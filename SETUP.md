# Setup guide

Everything runs on your own computer. Follow the steps in order; each has a check so you know it worked.
Time needed: about 30 minutes, most of it downloading the AI model.

**Setting this up on a computer that has nothing installed yet?** Skip straight to running `install.cmd` (Windows) or `./install.sh` (macOS/Linux) from this folder - it does steps 1, 3, 4 and 5 below for you: installs Node.js and Git if missing, sets up the built-in database, asks whether you want a cloud AI (paste an API key) or a local one with Ollama (and picks a model sized to your RAM), offers to set up WhatsApp alerts too (downloads and configures OpenWA - you only need to scan the QR code afterwards), and writes `backend/.env` / `frontend/.env`. Re-run it any time; it never overwrites a `.env` or setup you already have. The rest of this guide is for doing it by hand, or for the parts the installer does not cover (Gmail, phone access, optional job sources).

## Use it from your phone

The app is private to your computer by default. To reach it from your phone (experimental, not yet verified end to end):

1. **Set a login.** In `backend/.env` set `ACCESS_PASSCODE=` to a long passphrase. Without it, remote start refuses to run, because anyone who could reach the app could use your Gmail.
2. **Give your laptop a permanent private address with [Tailscale](https://tailscale.com)** (free): install it on the laptop and the phone, sign in to the same account, then note the laptop's `100.x.y.z` address (`tailscale ip -4`). It works from anywhere and is not reachable by anyone else.
3. **Start in remote mode:** `start.cmd remote` (Windows) or `./start.sh remote`. It prints the addresses to use.
4. On the phone open `http://100.x.y.z:5870` and enter your passcode.

Notes: the laptop must be awake. A temporary public tunnel link is possible but not recommended; if you use one, the passcode is your only protection. Never open ports on your router.

## Optional: Indeed listings (great for Qatar and the Gulf)

LinkedIn works out of the box. To also collect **Indeed** listings (Indeed Qatar has many more local jobs, and some ads include an email address), install the open-source [JobSpy](https://github.com/speedyapply/JobSpy) library once:

```bash
pip install python-jobspy
pip install -U numpy pandas      # only needed on Python 3.13 or newer
```

Then open **Sources** and switch **Indeed (via JobSpy)** on, and edit a search profile to include it. Optional settings in `backend/.env`: `INDEED_COUNTRY=Qatar` (default) and `PYTHON_BIN=` if Python is not on your PATH. Without JobSpy the source simply reports how to install it and nothing else is affected. It reads public pages gently (one small request per search, no login, no proxy), but Indeed's terms restrict automated access, so use it at your own discretion and keep searches modest.

## Optional: GulfTalent listings (Qatar) with a free Apify account

GulfTalent, Bayt and Naukrigulf block automated access, so the app uses a ready-made [Apify](https://apify.com) scraper for GulfTalent and only calls Apify's public API. Apify's free plan includes $5 of usage each month with no card, and this scraper costs about $0.7 per 1,000 jobs, so it comfortably covers a personal search.

1. Create a free account at apify.com and copy your API token from Settings, Integrations.
2. Add it to `backend/.env`: `APIFY_TOKEN=your-token` (never share or commit it).
3. Restart the app, open **Sources**, switch **GulfTalent (via Apify)** on, and include it in a search profile.

Each search fetches up to 25 jobs per keyword with full descriptions, apply links and recruiter emails when GulfTalent shows them. If the monthly credit runs out, the source says so and pauses until next month. Third-party scrapers can break; if it stops working, set `APIFY_GULFTALENT_ACTOR` to another GulfTalent actor.

## Optional: WhatsApp alerts

Shortlist BOT can send you a WhatsApp message through a small, free, self-hosted gateway called [OpenWA](https://github.com/rmyndharis/OpenWA), which lives in `services/openwa/` (its own separate git checkout - never part of this repo, and git-ignored on purpose because it holds your live WhatsApp session). This is entirely optional; skip it and everything else works the same.

Why self-hosted rather than an official API: WhatsApp's official Business API needs a Meta business account and per-conversation fees. OpenWA runs the same WhatsApp Web that a browser uses, for free, but it is unofficial, so there is a real (if small) chance of the linked number being restricted. **Use a spare number you can afford to lose, never your main one.**

**Set it up once:**
```bash
git clone https://github.com/rmyndharis/OpenWA.git services/openwa
cd services/openwa
cp .env.minimal .env
npm ci
npx puppeteer browsers install chrome
```
Then add two lines to `.env` (inside `services/openwa`): `HOST=127.0.0.1` (keeps it off your network, not just this app) and a strong `API_MASTER_KEY` (any long random string - this becomes its admin API key).

**Connect it to Shortlist BOT:**
1. Add the same key to `backend/.env`: `OPENWA_URL=http://127.0.0.1:2785` and `OPENWA_API_KEY=` (the same value you put in `services/openwa/.env`).
2. Restart Shortlist BOT with `start.cmd` / `./start.sh` - it now also starts OpenWA in the background if it's set up, and skips it silently if it is not (so this never breaks the app for someone who has not set it up).
3. Open **Settings → WhatsApp**. If OpenWA is running you'll see a **Connect WhatsApp** button and a QR code; scan it with WhatsApp on your phone (Settings → Linked devices → Link a device).
4. Under **Alert settings**, turn the switch on, check the number in **Send to** (it defaults to your own connected number - change it if you want alerts sent somewhere else), and click **Send test message** to confirm it actually arrives before relying on it.

If `services/openwa` does not exist, or OpenWA is not running, the WhatsApp tab just says so calmly - it is skippable on every other machine that runs this project. Once linked, a normal restart (`stop.cmd` / `start.cmd`) reconnects it by itself within about 40 seconds; only rescan the QR if the app tells you to.

## Ports

| What | Port | Change it with |
|---|---|---|
| App (browser) | **5870** | `port` in `frontend/vite.config.ts`, and `FRONTEND_URL` in `backend/.env` |
| API | **5871** | `PORT` in `backend/.env`, and `VITE_API_BASE_URL` in `frontend/.env` |
| Built-in database (Option B) | **5872** | `PGLITE_PORT` environment variable, and `DATABASE_URL` |
| PostgreSQL (Option A) | 5432 | your PostgreSQL install |
| Ollama | 11434 | `OLLAMA_BASE_URL` in `backend/.env` |

They are deliberately uncommon so Shortlist BOT can run all the time next to your other projects.

## 1. Install the prerequisites

| Tool | Version | Get it | Check |
|---|---|---|---|
| Node.js | 20 or newer | https://nodejs.org | `node -v` |
| Git | any | https://git-scm.com | `git --version` |
| PostgreSQL | 14 or newer (or use the no-install option in step 3) | https://www.postgresql.org/download | `psql --version` |
| Ollama | latest | https://ollama.com/download | `ollama --version` |

## 2. Get the code

```bash
git clone https://github.com/maiz-an/Shortlist-BOT.git
cd Shortlist-BOT
```

## 3. Start a database

Pick **one**.

### Option A: PostgreSQL (recommended)
1. Install PostgreSQL and remember the `postgres` user's password.
2. Create the database:
   ```bash
   createdb -U postgres job_app_automation
   ```
   (or open pgAdmin and create a database called `job_app_automation`).

### Option B: no install, no admin rights (PGlite)
Use this if you cannot install PostgreSQL, for example on a locked-down Windows machine. PGlite is real PostgreSQL compiled to WebAssembly; it needs nothing but Node.
```bash
cd Setup
npm install
npm run db          # leave this window open; data is kept in Setup/pgdata
```
On its first start it also creates all the tables. It listens on `127.0.0.1:5872` with user `postgres`, password `postgres`, database `postgres`. It accepts one connection at a time, which is enough for one person.

## 4. Get the AI model

```bash
ollama pull qwen3:8b
ollama list         # should show qwen3:8b
```
The download is about 5 GB. If the pull seems stuck at "verifying", run the same command again. You need about 8 GB of free RAM to run it; without a GPU each analysis takes a few minutes. On a smaller machine, pull a lighter model instead (`qwen3:4b` needs about 4 GB RAM, `qwen3:1.7b` about 2 GB) and set `OLLAMA_MODEL` to match in `backend/.env`.

**No Ollama, or prefer a cloud AI?** Set `AI_PROVIDER=openai` in `backend/.env` plus `AI_API_KEY` (and `AI_API_BASE_URL` / `AI_API_MODEL` if you're not using OpenAI itself) - see the commented-out block in `backend/.env.example`. This works with OpenAI, OpenRouter, Groq, Together.ai, or anything else that speaks the OpenAI chat-completions format. Skip the rest of this step if you go this way.

## 5. Configure and install the backend

```bash
cd backend
npm install
npm run init-env
```
`init-env` creates `backend/.env` and `frontend/.env` with fresh random secrets. Then open `backend/.env` and set `DATABASE_URL`:

- Option A: `postgresql://postgres:YOUR_PASSWORD@localhost:5432/job_app_automation?schema=public`
- Option B: `postgresql://postgres:postgres@127.0.0.1:5872/postgres?schema=public&connection_limit=1&sslmode=disable&pgbouncer=true`

Create the tables and starter data:
```bash
npm run db:setup    # Option A
```
For **Option B**, the database script already created the tables on its first start, so only seed the starter data:
```bash
npm run db:seed     # sources, 3 CV profiles, 2 search profiles
```

## 6. Install the frontend and run everything

Open two terminals:
```bash
# terminal 1
cd backend && npm run start:dev
# terminal 2
cd frontend && npm install && npm run dev
```
Open **http://localhost:5870**. Use `localhost`, not `127.0.0.1` (CORS only allows the configured address).

Check: the sidebar's System box shows Backend, Database and Ollama with green dots, and the **App health** page says everything is running.

## 7. First-time setup inside the app

1. **Settings**: enter your name, email and phone (used to sign emails). Your experience, years and skills are read from your CV files, so scoring and emails always match the CV they use.
2. **CV profiles**: fill in each CV's skills, then upload two things - they're independent:
   - **CV file** (PDF or DOCX, max 5 MB; older .doc is not supported since its text can't be read - save as .docx or export to PDF first) - only used to read your skills and experience for scoring and emails, never sent anywhere.
   - **PDF for sending** (PDF only, max 5 MB) - your own, properly formatted PDF, exactly what gets attached when an application email is sent. Sending is blocked until you upload one; preview it any time from the CV profiles page.
3. **Email**: connect Gmail (next section).
4. **Dashboard, Find new jobs**, or **Search, Add job manually**. Good matches land in Review.

## 8. Connect Gmail (needed to send applications)

You create your own free Google OAuth client, so nobody else ever holds access to your mailbox.

1. https://console.cloud.google.com, create a project, and enable the **Gmail API**.
2. **Google Auth Platform**: configure the consent screen, choose **External**, and add your Gmail address under **Audience, Test users**.
3. **Clients, Create client**: type **Web application**, authorized redirect URI
   `http://localhost:5871/api/email/oauth/callback`. Copy the client ID and secret.
4. Put them in `backend/.env`:
   ```
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   ```
5. Restart the backend, open **Email** in the app and click **Connect Gmail**. On Google's "hasn't verified this app" screen choose **Advanced, Go to ... (unsafe)**. That warning is expected for your own test app.

Only the permission to send email is requested. While the app is in Google's Testing mode the connection expires after 7 days; just reconnect.

## Everyday use (Windows)

Everything runs **hidden in the background**: no console windows, nothing in the taskbar.

| Do this | To |
|---|---|
| Double-click `create-shortcuts.cmd` once | Put **Shortlist BOT** and **Stop Shortlist BOT** shortcuts on your Desktop. Starting is then one click; the app opens in your browser. |
| Double-click `start.cmd` | Start everything (shows progress in a window that closes itself), then open the app |
| Double-click `stop.cmd` | Stop the app, API and built-in database (Ollama is left running; `stop.cmd all` stops it too) |
| Double-click `autostart-on.cmd` | Start quietly every time you sign in to Windows. `autostart-off.cmd` turns it off. |

Logs are written to the `logs` folder. If something fails to start, a message box tells you why.

On macOS/Linux use `./start.sh` and `./stop.sh` (they also run in the background; add `remote` to allow your phone).

Manual start (for development):
```bash
# Option B only, first:  cd Setup && npm run db
cd backend  && npm run start:dev
cd frontend && npm run dev
```

## Updating to a new version

Settings → System shows your current version and checks GitHub for a newer one. To update, run:

```bash
update.cmd      # Windows
./update.sh     # macOS / Linux
```
It pulls the latest code, reinstalls packages, prepares the database client, and applies any new database migrations (best-effort on the built-in database - see below) - then run `start.cmd` / `./start.sh` again. Safe to re-run if a step fails partway through; your `.env` files and stored data are never touched.

Doing it by hand instead:
```bash
git pull
cd backend  && npm install && npm run db:deploy     # applies any new database migrations
cd ../frontend && npm install
```
Either way, read [CHANGELOG.md](CHANGELOG.md) first; a release can ask you to change your `.env` files. The current version is in the `VERSION` file.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Sidebar shows "Backend unreachable" | Start the backend; check port 5871 is free. |
| Database dot is red | Start PostgreSQL (or `npm run db` in `Setup`) and re-check `DATABASE_URL`. |
| Ollama dot is red | Start Ollama and run `ollama pull qwen3:8b`. |
| Jobs stay "New" | The model was unavailable. Fix it, then click **Retry unanalyzed jobs** on the Jobs page. |
| Page is blank or "Cannot reach the backend" | Open the app at `http://localhost:5870`, not `127.0.0.1`. |
| "Application Control policy has blocked this file" (Windows) | Your machine blocks unsigned programs. Use Option B for the database. The frontend uses WebAssembly builds of its bundler for the same reason. |
| Gmail says `access_denied` | Add your address as a test user in the Google consent screen. |
| Gmail worked, then stopped after a week | Testing-mode apps expire after 7 days. Click **Connect Gmail** again. |
| Send blocked: "CV file missing" | Upload the file on the CV profiles page. |
| Send blocked: "No PDF has been uploaded for sending" | Upload a PDF (your own, not the CV file used for scoring) on the CV profiles page. |

## Your data and secrets

- CV files stay in `backend/storage/cvs`. Database contents stay in your database. Nothing is sent anywhere except job-site requests and the emails you approve.
- `backend/.env` and `frontend/.env` contain secrets and are never committed. Do not share them.
- Never commit a Google `client_secret*.json` file; the repository ignores them.
