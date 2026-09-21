# Setup guide

Everything runs on your own computer. Follow the steps in order; each has a check so you know it worked.
Time needed: about 30 minutes, most of it downloading the AI model.

## Use it from your phone

The app is private to your computer by default. To reach it from your phone (experimental, not yet verified end to end):

1. **Set a login.** In `backend/.env` set `ACCESS_PASSCODE=` to a long passphrase. Without it, remote start refuses to run, because anyone who could reach the app could use your Gmail.
2. **Give your laptop a permanent private address with [Tailscale](https://tailscale.com)** (free): install it on the laptop and the phone, sign in to the same account, then note the laptop's `100.x.y.z` address (`tailscale ip -4`). It works from anywhere and is not reachable by anyone else.
3. **Start in remote mode:** `start.cmd remote` (Windows) or `./start.sh remote`. It prints the addresses to use.
4. On the phone open `http://100.x.y.z:5870` and enter your passcode.

Notes: the laptop must be awake. A temporary public tunnel link is possible but not recommended; if you use one, the passcode is your only protection. Never open ports on your router.

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
The download is about 5 GB. If the pull seems stuck at "verifying", run the same command again. You need about 8 GB of free RAM to run it; without a GPU each analysis takes a few minutes.

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

1. **Settings**: enter your name, years of experience and short experience notes. Emails only use facts written here and on your CV skills.
2. **CV profiles**: fill in each CV's skills and upload the PDF/DOC/DOCX file (max 5 MB).
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

```bash
git pull
cd backend  && npm install && npm run db:deploy     # applies any new database migrations
cd ../frontend && npm install
```
Read [CHANGELOG.md](CHANGELOG.md) first; a release can ask you to change your `.env` files. The current version is in the `VERSION` file.

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

## Your data and secrets

- CV files stay in `backend/storage/cvs`. Database contents stay in your database. Nothing is sent anywhere except job-site requests and the emails you approve.
- `backend/.env` and `frontend/.env` contain secrets and are never committed. Do not share them.
- Never commit a Google `client_secret*.json` file; the repository ignores them.
