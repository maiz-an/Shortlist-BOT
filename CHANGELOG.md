# Changelog

All notable changes to Shortlist BOT. Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
The single source of truth for the current version is the `VERSION` file; `backend/package.json` and `frontend/package.json` match it.

## [1.2.0] - 2026-09-22

### Added
- **Auto-apply** switch in Settings, **off by default**. When on, a new job is emailed automatically only if every safety rule passes: recommendation Apply and score at or above your threshold (default 80%), an application email on the job, a CV file, Gmail connected, an email written by the AI (never the fallback template), and under a daily limit (default 10). Off means nothing is ever sent by itself.
- **Phone / remote access (experimental, not yet verified end to end).** Optional passcode login (`ACCESS_PASSCODE`), a same-origin `/api` proxy so any device can use the app, and `start.cmd remote` / `./start.sh remote`. Remote start refuses to run without a passcode. Recommended: Tailscale (see SETUP.md). Do not put the app on the public internet.
- Start/stop scripts for Windows (`start.cmd`, `stop.cmd`, `create-shortcuts.cmd`, `autostart-on/off.cmd`) and macOS/Linux (`start.sh`, `stop.sh`). Everything runs **hidden**: no console windows, no taskbar entries.
- Settings is organized into tabs (Profile, Auto-apply, Matching, Automatic search, System). The app version now lives in Settings, About.
- "a Maiz's one" watermark on the splash screen and sidebar.
- Read-only Database browser and App health page (from 1.1.x) now sit before Settings in the sidebar.

### Changed
- **Better scoring.**
  - Missing skills are cleaned (dropped when already on your CV, vague, or duplicated) and capped at 12; real gaps worded differently from the ad are now recognised.
  - An ad naming only one or two skills no longer earns a free 100% skills score.
  - Being one year short of the required experience is a stretch, not a fit.
  - A strong AI "SKIP" can no longer become an automatic Apply.
  - The reason text is built from the real numbers and says when the AI disagreed.
- AI answers where a skill list arrives as one text string are repaired instead of failing the analysis.
- `VITE_API_BASE_URL` now defaults to empty (same-origin). Existing `frontend/.env` files with an absolute URL keep working.

### Upgrading from 1.1.x
Nothing is required. To use a phone, set `ACCESS_PASSCODE` in `backend/.env` (see SETUP.md). Jobs analysed before this version keep their old scores until you re-run the analysis.

## [1.1.1] - 2026-09-21

Repository housekeeping. No change to how the app behaves.

### Added
- MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, issue and pull request templates, `.editorconfig`.
- GitHub Actions CI: backend type-check and tests, frontend build, and a check that `VERSION`, both `package.json` files and the changelog agree.
- Package metadata (name, description, repository, license, Node engine) and a fuller README with badges, feature list and roadmap.

## [1.1.0] - 2026-09-21

### Changed (action needed if you already run 1.0.0)
- Default ports now use an uncommon range so Shortlist BOT can run next to your other projects (which usually take 3000, 4000, 5432):
  app **5870**, API **5871**, built-in local database **5872**. Real PostgreSQL still uses its normal port 5432.
- To upgrade an existing install, edit `backend/.env` (`PORT`, `FRONTEND_URL`, `GMAIL_REDIRECT_URI`, and the port in `DATABASE_URL` if you use the `Setup` database) and `frontend/.env` (`VITE_API_BASE_URL`), then change the **authorized redirect URI** on your Google OAuth client to `http://localhost:5871/api/email/oauth/callback`.
- Open the app at http://localhost:5870.

## [1.0.0] - 2026-09-21

First release.

### Features
- Collect jobs from LinkedIn public listings (`linkedin-jobs-api`) through a pluggable `JobSource` interface, rate limited and failure tolerant.
- Deduplicate across sources by source ID, URL, normalized company/title/location and description similarity.
- Analyze every job with a local Ollama model (`qwen3:8b`) behind an `AIProvider` interface; strictly validated JSON output with one retry.
- Deterministic scoring layer (skills, title, experience, location, job type, CV relevance, AI signal, excluded keywords) with configurable score bands.
- Pick the best of your CV profiles per job; upload and replace CV files (PDF/DOC/DOCX) stored locally.
- Generate a personalized application email that only claims skills on the selected CV; edit before sending.
- Send through your own Gmail with OAuth (`EmailProvider` interface); tokens encrypted at rest; explicit confirmation before every send.
- Application tracker with status workflow, history, notes, follow-up and interview dates.
- Search profiles, manual job entry, and a scheduler. Applications are never sent automatically.
- Dashboard, App health page (frontend, backend, database, AI model, Gmail, checks with fixes) and a read-only Database browser with CSV/JSON export.
- Lightweight rule-based Shortlist BOT tips on the dashboard.
- Light theme, IBM Plex Sans and Newsreader fonts, splash screen and subtle motion (framer-motion), respecting reduced-motion.

### Security
- API token header, loopback bind, explicit CORS, helmet, input validation, HTML stripped from user and job text, upload content sniffing, log redaction, secrets only in `.env`.

### Known limitations
- LinkedIn is the only job source so far. Others (Indeed, Bayt, GulfTalent, ...) are scaffolded but not implemented.
- The Gmail OAuth app runs in Google's Testing mode, so the connection expires after 7 days and must be reconnected.
- Analysis speed depends on your hardware; `qwen3:8b` is slow on CPU only.
