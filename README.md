# Shortlist BOT

A local-first job application assistant.

Collect jobs from free sources → deduplicate → analyze with a **local Ollama model** → pick the best CV →
score → draft an email → you review/edit → send via **your Gmail (OAuth)** → track everything.
Nothing is sent automatically. No paid APIs or cloud services.

| Part | Stack | URL |
|---|---|---|
| Frontend | React, Vite, TypeScript, Tailwind, React Router, TanStack Query | http://localhost:5870 |
| Backend | NestJS, Prisma, PostgreSQL, REST | http://localhost:5871/api |
| AI | Ollama (`qwen3:8b`) behind an `AIProvider` interface | http://localhost:11434 |

## Quick start
Full walkthrough, including the no-admin database option, Ollama and Gmail: **[SETUP.md](SETUP.md)**.

```bash
git clone https://github.com/maiz-an/Shortlist-BOT.git && cd Shortlist-BOT
cd backend && npm install && npm run init-env      # then set DATABASE_URL in backend/.env
npm run db:setup && npm run start:dev               # terminal 1
cd ../frontend && npm install && npm run dev        # terminal 2
```
Needs Node.js 20+, PostgreSQL (or the PGlite option in `Setup/`) and [Ollama](https://ollama.com) with `ollama pull qwen3:8b`.
Open http://localhost:5870 (use `localhost`, not `127.0.0.1`). Ports are deliberately uncommon (app 5870, API 5871, local database 5872); see [SETUP.md](SETUP.md#ports).

## Versioning
Current version: see [VERSION](VERSION). Releases follow semantic versioning and are listed in [CHANGELOG.md](CHANGELOG.md); each one is a git tag (`v1.0.0`, ...).

## First steps in the app
1. **Settings** – enter your name, years of experience and experience notes (only facts written here and in CV skills are ever used in emails).
2. **CVs** – fill in skills for each CV profile and upload the PDF/DOC/DOCX (stored in `backend/storage/cvs`, not in the database).
3. **Email** – configure Gmail OAuth (see below) and click *Connect Gmail*.
4. **Dashboard → Find new jobs** (or **Search → Add job manually**). Jobs are analyzed one at a time by Ollama; good matches land in *Review*.
5. Open a job → *Review application* → edit → *Send application* (a confirmation dialog shows recipient, subject, body and attachment).

### Gmail OAuth
Google Cloud Console → create a project → enable **Gmail API** → OAuth consent screen (External, add yourself as test user) →
Credentials → *OAuth client ID*, type **Web application**, redirect URI `http://localhost:5871/api/email/oauth/callback`.
Put the client ID/secret in `backend/.env` (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`) and restart the backend.
Step-by-step Gmail setup is in [SETUP.md](SETUP.md). Only the `gmail.send` scope is requested. No password is ever stored; tokens are AES-256-GCM encrypted with `TOKEN_ENCRYPTION_KEY`.

## Tests
```bash
cd backend && npm test          # normalization, dedup, scoring, CV selection, AI JSON validation,
                                # source failures, email generation, status changes
cd backend && npm run typecheck
cd frontend && npm run build
```

## Architecture notes
- `backend/src/modules/*`: `ai` (provider abstraction + prompts in `ai/prompts/`), `job-sources` (`JobSource` interface, `LinkedInSource` using
  `linkedin-jobs-api`), `jobs` (normalization + dedup), `job-analysis` (AI → deterministic CV pick + score → queue), `search` (profiles, runner, scheduler),
  `email` (`EmailProvider` interface, `GmailProvider`), `applications` (status workflow + history), `cv-profiles`, `dashboard`, `settings`.
- **Add a source**: implement `JobSource` (`key`, `name`, `search(criteria)`) and add it to `JOB_SOURCES` in `job-sources.module.ts`.
- **Add an AI/email provider**: implement `AIProvider` / `EmailProvider` and change the `useExisting` binding in `ai.module.ts` / `email.module.ts`.
- **Scoring** (`job-analysis/scoring.ts`): skills 35, title 20, experience 10, location 10, employment type 5, CV relevance 10, AI semantic 10, minus excluded-keyword penalties. Band thresholds are editable in Settings.
- **Security**: API requires `X-Api-Token` (from `API_TOKEN`), bound to `127.0.0.1`, explicit CORS, helmet, DTO/zod validation, HTML stripped from all user/job text, uploads limited to PDF/DOC/DOCX ≤ 5 MB with content sniffing, secrets only in `.env`, log redaction.
- LinkedIn collection uses only public guest listings, is rate limited (per-source delay in **Sources**), stops on HTTP 429, and never logs in or bypasses CAPTCHAs.

## Troubleshooting
- *Ollama unavailable*: jobs stay `NEW` with the error shown; start Ollama and click **Retry unanalyzed jobs** on the Jobs page. Email drafts fall back to a plain fact-only template when the model is down.
- *Backend unreachable*: the sidebar's System panel shows backend / database / Ollama state.
