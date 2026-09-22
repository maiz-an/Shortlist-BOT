# Changelog

All notable changes to Shortlist BOT. Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.
The single source of truth for the current version is the `VERSION` file; `backend/package.json` and `frontend/package.json` match it.

## [1.4.0] - 2026-09-22

### Fixed
- **A real layout bug on any screen narrower than about 1100px** (phones, small tablets, some laptop windows): several cards (the application tracker, the CV edit form, job/CV detail grids, filter bars) used a CSS grid that had no single-column fallback, so on a narrow screen the browser let them grow to their natural full width instead of shrinking to fit, pushing content off the right edge. Every such grid across the app now has an explicit single-column base, so nothing is cut off at any width.

### Changed
- **Scoring now accounts for the level of the role.** An internship, trainee or new-grad role loses 35 points if you have 2 or more years of experience, and a senior or lead title with no stated years loses 8 if you have under 6. The reason text says why.
- **Existing jobs are re-scored automatically once after an upgrade** from their saved AI answers (fast, no model call), and jobs that now score as a clear Skip leave the review queue unless you had already started on them. `POST /api/jobs/rescore` does the same on demand.
- The Jobs list now opens sorted by best match, and sorting by match hides jobs that have not been scored yet so they cannot sit above the best ones.
- **Scrollbars are slim and match the app's theme** everywhere a box scrolls (the page, tables, the database view, modals, the mobile menu), instead of the browser's default one.
- **The Jobs and Applications tables adapt to the screen.** Below about 1100px wide they switch to a stack of cards (no side-scrolling needed); from about 1100px up they show the full table, now sized so text wraps onto two or three lines instead of one word per line.
- Checked and confirmed clean (no cut-off content, no needless side-scrolling) on every page from a small phone (320px) up to an ultra-wide monitor (2560px), including all Settings tabs and the CV/job/application detail pages.

### Added
- **GulfTalent (Qatar) as an optional source through Apify's free plan.** Full descriptions, apply links and recruiter emails. See SETUP.md.
- **Follow-ups.** When an application is sent, a follow-up date a week later is set automatically. The dashboard lists follow-ups that are due, overdue dates show in red on the Applications page, and each applied application has a ready-to-send follow-up note that opens in your own mail app.
- **Indeed as an optional job source** (via the open-source JobSpy library). Optional install, see SETUP.md. Uses a quoted phrase search so results match the job title, one small request per search, no login. Picked from a review of free options: Bayt blocks automated access (HTTP 403) and is not used; Adzuna has no confirmed Gulf coverage, JobDataAPI is paid, and Arbeitnow (Europe) and Remotive (remote only, strict terms) add little for Qatar.

## [1.3.0] - 2026-09-22

### Changed
- **Scores and emails now come from your CV, not from Settings.** When you upload a PDF or DOCX, the app reads its text and works out your years of experience from the job dates on it. Settings keeps only name, email and phone. The old "Years of experience", "Summary" and "Experience notes" fields are gone.
- **Emails are written in two steps.** First the AI finds the single strongest honest match between the ad and your CV and quotes the CV line that proves it (the quote is checked against the CV). Then it writes a short email around that match, naming the real employer.
- **Emails are short and human.** About 60 to 100 words, plain everyday English, no em dashes and no stock phrases. Openers and closing lines vary from job to job, and the layout (greeting, paragraphs, sign-off) is fixed in code.
- **Honesty checks.** A draft is rejected and rewritten if it claims skills you lack, uses a technical term or figure that is not on your CV, sounds more senior than the CV ("managed", "led", "senior"), or uses stock phrases. If the ad asks for more years than your CV shows, the email says so plainly, with wording worked out from the numbers.
- If a CV has no readable text, or the AI keeps failing the checks, a short fact-only email is used, built from a real CV line and employer.
- A warning appears when a job barely matches your CV.

### Added
- The CVs page shows how many years of experience were read from each CV.
- New columns `CVProfile.textContent` and `CVProfile.experienceYears` are added automatically on start (and by migration `20260922000000_cv_text`).
- The database connection is retried for a few seconds on start.

### Upgrading from 1.2.x
Nothing to do. On first start the app reads the text of CVs you already uploaded. Scores of existing jobs change only when they are analysed again.

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
