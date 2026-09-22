# CLAUDE.md

Orientation for Claude Code sessions working on this repo. Read this first — it exists so you
don't have to re-explore the codebase from scratch every session. **Keep it updated**: when you
add/rename/remove a module, page, script, or change a convention documented here, update the
relevant section in the same turn. If something here turns out to be stale, fix it rather than
leaving it wrong for the next session.

## What this is

**Shortlist BOT** — a local-first, single-user job-application assistant for Maizan (owner/user).
Finds jobs, dedupes, analyzes each with a local/cloud AI model, picks the best CV, drafts an
honest application email, and lets the user review and send from their own Gmail. Nothing is
sent automatically unless auto-apply is explicitly turned on, and even then strict rules gate it.
Repo: `maiz-an/Shortlist-BOT` (GitHub). Current version: see `VERSION` (source of truth; keep
`backend/package.json`, `frontend/package.json` and `CHANGELOG.md` in sync with it — CI checks
this on every push).

## Tech stack

- **Backend**: NestJS + TypeScript, Prisma ORM, PostgreSQL (or a built-in PGlite instance — see
  below). One module per feature, most as a **single file** combining `@Module`/`@Controller`/
  `@Injectable` (e.g. `whatsapp.module.ts`, `system.module.ts`) — follow this pattern for new
  small modules rather than splitting into separate files.
- **Frontend**: React + TypeScript + Vite, TanStack Query, Tailwind, framer-motion.
- **Tests**: Jest (backend only; `npx jest` from `backend/`). No frontend test suite — frontend
  correctness is `tsc --noEmit` + `npm run build` + manual/browser verification.

## Directory map

```
backend/src/modules/
  ai/            AIProvider interface + OllamaProvider + OpenAiCompatibleProvider (ai.module.ts
                 picks one via AI_PROVIDER env var). Add a new provider here.
  job-sources/   JobSource interface + linkedin/indeed/gulftalent implementations.
  job-analysis/  Core pipeline: analysis.service.ts (AI call -> score -> CV pick -> status),
                 analysis-queue.service.ts (sequential in-process queue, one job at a time),
                 cv-selection.ts (deterministic CV-to-job matching, see below), scoring.ts.
  jobs/          Job CRUD, dedup, ingest.
  applications/  Application tracker (status workflow, history, follow-ups).
  cv-profiles/   CV profiles. Two independent files per CV: `filePath` (PDF/DOCX, read for
                 skills/experience text only) and `sendPdfPath` (a PDF the user uploads
                 themselves, attached to emails — never auto-generated; see "CV files" below).
  email/         email-generation.service.ts (two-step honest email writing), email-send.service.ts
                 (Gmail send), auto-apply.service.ts (auto-draft + auto-send, both opt-in gated).
  whatsapp/      Optional OpenWA integration (services/openwa/, a separate git checkout).
  system/        Update-check against GitHub Releases API (Settings > System).
  settings/      Key-value settings store; SETTING_DEFAULTS in settings.service.ts is the schema.
  search/        Search profiles + scheduler.
  dashboard/ database/ health/ auth/   — mostly self-explanatory.

frontend/src/
  pages/         One file per route (CvsPage.tsx, JobsPage.tsx, SettingsPage.tsx, ...).
  features/<x>/api.ts   TanStack Query hooks per feature, thin wrappers over apiClient.
  components/ui.tsx     Shared UI kit (Button, Card, Modal, Toggle, Field, Badge, ...) — reuse
                         these, don't hand-roll. Toggle is the switch component; every
                         enable/disable control in the app uses it, not a checkbox or text button.
  types/index.ts         Shared frontend types (mirror backend response shapes).
```

## Key architectural patterns

- **AIProvider abstraction** (`backend/src/modules/ai/ai-provider.ts`): business code only
  depends on this interface (`name`, `model`, `isAvailable()`, `generate()`, optional `details()`).
  `AI_PROVIDER` env var picks `ollama` (default, local) or `openai` (any OpenAI-chat-compatible
  cloud API — OpenAI/OpenRouter/Groq/Together.ai/... via `AI_API_BASE_URL`/`AI_API_KEY`/
  `AI_API_MODEL`). Never hardcode which provider is active.
- **CV selection** (`job-analysis/cv-selection.ts`): deterministic, not AI-decided. `selectCv()`
  scores every enabled CV against a job's title/skills/category; the AI's suggested CV only nudges
  the result by +0.05. Covered by `cv-selection-real.spec.ts` using the real live CV data (not
  synthetic fixtures) to guard against a Full Stack job ever picking the IT Support CV or vice
  versa — extend this test if CV-matching logic changes.
- **CV files — two independent slots, do not conflate them**: `filePath`/`originalFileName` is
  read for text only (PDF or DOCX, whichever the user has); `sendPdfPath`/`sendPdfOriginalFileName`
  is a PDF the user uploads themselves and is the *only* thing ever attached to an application
  email (`resolveAttachment()` in `cv-profiles.service.ts`). There is deliberately no
  auto-generated PDF anymore (an earlier pdfkit-based auto-converter was removed — it looked bad
  and the user wanted full manual control over what gets sent). Sending is blocked with a clear
  message until a send-PDF is uploaded, not silently substituted.
- **Honest email generation** (`email/email-generation.service.ts`): two-step — AI first finds
  the single strongest true match between ad and CV and quotes a real CV line, then writes a
  short email around it. Multiple honesty checks reject overclaiming (see `email-draft.ts`:
  `findOverclaims`, `findUngrounded`, `findUngroundedNumbers`). Auto-draft
  (`auto-apply.service.ts: maybeAutoDraft`) writes a draft the moment a job scores ≥50
  (`AUTO_DRAFT_MIN_SCORE`) but **never overwrites an existing draft** — to force regeneration,
  delete the `EmailDraft` row first (there's no bulk-delete endpoint; use a scoped one-off Prisma
  script, see "Bulk data changes" below).
- **Settings pattern**: `SETTING_DEFAULTS` in `settings.service.ts` (zod-validated in
  `settings.controller.ts`) + frontend `useDraft()` hook in `SettingsPage.tsx`. Add a new setting
  key there, not as a bespoke env var, unless it's a deployment-time secret (those go in `.env`).
- **Update-check** (`system/system.module.ts`): calls GitHub's Releases API (not tags), 1h cache,
  degrades gracefully (`checked: false`) when offline/rate-limited — never throws.
- **Scoring version bump**: `analysis.service.ts` exports `SCORING_VERSION`; bump it when scoring
  rules change and existing jobs get re-scored once automatically on next boot (cheap, no AI call).

## Ports & the built-in database

App **5870**, API **5871**, built-in PGlite database **5872** (`Setup/pglite-server.js`, a
single-connection Postgres-compatible DB for the no-admin-rights install path;
`DATABASE_URL` containing `:5872/` is how `start.cmd`/`start.sh` know to launch it). Real
PostgreSQL works too (`5432` typically) if the user points `DATABASE_URL` there — see
`backend/.env.example`.

**Migrations**: this repo supports both. A real migration file goes in
`backend/prisma/migrations/<timestamp>_<name>/migration.sql` (Prisma's normal `migrate deploy`
path, for real Postgres). But the built-in PGlite DB **cannot run `prisma migrate`**, so every
additive schema change also needs a matching idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line in `backend/src/prisma/prisma.service.ts`'s
`ensureSchema()`, which runs on every boot. Forgetting the `ensureSchema()` line means the
built-in-DB install path silently doesn't get the new column.

## Run / test / verify

```bash
# Backend (from backend/)
npm run start:dev        # nest start --watch
npm run typecheck        # tsc --noEmit
npx jest                 # full suite (170+ tests as of v1.7.0)
npx prisma generate      # after any schema.prisma change — do this BEFORE typecheck/jest

# Frontend (from frontend/)
npm run dev
npx tsc --noEmit -p tsconfig.json
npm run build

# Whole app
start.cmd / ./start.sh          # starts db (if built-in), Ollama, API, app, OpenWA (if set up)
stop.cmd / ./stop.sh             # stops everything Ollama excluded (stop.cmd all stops Ollama too)
update.cmd / ./update.sh         # git pull + reinstall + migrate, safe to re-run
install.cmd / ./install.sh       # first-run setup for a machine with nothing installed
```

CI (`.github/workflows/ci.yml`): backend typecheck+test, frontend build, and a
`version-consistency` job checking `VERSION` matches both `package.json` files and that
`CHANGELOG.md` has a `## [x.y.z]` entry for it. All three must agree before pushing a release.

## Environment gotchas (hard-won this session — don't rediscover these)

- **`@prisma/client` import leaks `backend/.env` into `process.env`** as a side effect (even in
  Jest). Any test that constructs a `ConfigService(someObject)` and expects that object to win
  must first `delete process.env.THE_KEY` (or set it explicitly) in `beforeEach` — `ConfigService`
  checks `process.env` *before* the object passed to its constructor. See `whatsapp.spec.ts` /
  `cv-pdf.spec.ts` for the pattern.
- **PowerShell `Get-Content` returns a scalar string, not an array, for a single-line file.**
  `$c = Get-Content $p; $c += 'new line'` then silently *concatenates onto the same line* instead
  of appending a new line, only for single-line files (multi-line files are unaffected, which is
  why this can hide for a long time). Always force array type: `$c = @(Get-Content $p)`. Bit both
  `install.cmd`'s `:setenvfile` and would have bitten `services/openwa/.env` edits — fixed, keep
  the `@()` wrapper if you touch that code.
- **Batch `EnableDelayedExpansion` eats a lone `!`** even inside a plain `echo` string, especially
  inside a parenthesized `if (...)` block — `echo [!] warning` silently loses the `!`. Escape as
  `[^^!]` (double-caret) inside a block, `[^!]` is not always enough. Grep for bare `!` before
  adding new echo lines to `install.cmd`/`update.cmd`.
- **`git init` defaults to branch `master` locally** even when the remote's default branch is
  `main` — if you ever bootstrap a bare folder into a git checkout (as `install.cmd`/`install.sh`
  do for a ZIP-downloaded copy), use `git init -b main` explicitly, then `git reset --hard
  origin/main`. `git checkout -B main origin/main` will *refuse* if untracked files would be
  overwritten (a real conflict for e.g. a pre-existing `VERSION` file); `reset --hard` doesn't
  have that problem.
- **This sandbox's Bash tool's `cmd /c "somefile.cmd"` often silently no-ops** (returns instantly
  with just the OS banner, no actual execution) for the top-level orchestration scripts
  (`start.cmd`, `stop.cmd`, `update.cmd`, `install.cmd`). The **PowerShell tool's** `cmd /c "..."`
  does execute them for real. If you need to actually run one of these scripts to verify behavior,
  use the PowerShell tool, not Bash. Direct `npm`/`node` calls work fine from either.
- **A spawned `node`/`python` process resolves a bare `/tmp/...` or `/g/...` path relative to the
  current Windows drive**, not the Bash/MSYS-mapped location (e.g. `/tmp/x` → `G:\tmp\x`, and a
  `require('/g/GitHubRep/...')` from a `node -e` one-liner fails outright). Use explicit
  `G:/...`/`G:\...` paths for anything a spawned native process itself opens.
- **`npx prisma generate` fails with `EPERM` renaming `query_engine-windows.dll.node`** if any
  backend process (even a stray `nest start --watch` from an earlier session) is still running.
  `stop.cmd`/`stop.sh` only reliably kill processes launched through their own `scripts/run-*.cmd`
  wrappers or listening on the known ports — a manually-started `npm run start:dev` can survive
  and keep the lock. If generate fails, check `Get-CimInstance Win32_Process -Filter
  "Name='node.exe'"` for a leftover backend process and kill it directly.

## Bulk / destructive data changes — house rules

A past mistake in this project: calling `DELETE /api/cv-profiles/:id` when the intent was only to
clear one field, which deleted an entire real CV profile and its uploaded file (the file delete is
a real `fs.unlink`, not a Recycle Bin operation — unrecoverable from the app side). Since then:

- **Never call a bulk/delete endpoint without first reading the actual schema relations**
  (`onDelete: Cascade` vs `SetNull`) to know exactly what else would be affected. Check row counts
  before *and* after via `GET /api/database/overview`.
- **Prefer the narrowest tool for the job.** There is usually no dedicated "clear X" endpoint for
  an unusual bulk operation — write a small one-off Node script using `PrismaClient` directly with
  an explicit `where` clause, run it, print before/after counts, then delete the script. Don't
  reach for an existing endpoint whose blast radius is broader than what you actually intend (e.g.
  a full-resource `DELETE` when you mean "clear one relation").
- **Re-analysis overwrites in place** (`jobAnalysis.upsert`) — you almost never need to delete
  `JobAnalysis` rows to "re-analyze everything"; just re-enqueue every job id via
  `POST /jobs/:id/analyze` (sequential queue, one job at a time through the AI — 242 jobs takes
  hours locally, plan accordingly and use a background watch rather than blocking on it).
  `EmailDraft` rows *do* need explicit deletion first if you want regeneration, since
  `maybeAutoDraft` deliberately never overwrites an existing draft.

## Release process (established pattern)

Direct commits to `main` (no PR workflow for this solo project) — see `git log` for the
`Release X.Y.Z: ...` message convention. Bump `VERSION` + both `package.json` files, write a
`CHANGELOG.md` entry, verify full backend+frontend CI equivalent locally (`npm ci` — not just
`npm install` — plus typecheck/test/build) before pushing, then `git tag -a vX.Y.Z`, push commit
and tag, and create the GitHub Release (needs `gh` CLI or a token — not always available in this
environment; if missing, say so plainly rather than skipping it silently, since the in-app
"check for updates" feature reads GitHub's *Releases* API specifically, not tags).

**Always confirm before committing/pushing** unless the user has explicitly said to proceed in
the current conversation — this project's owner has asked for that pause before every release so
far.
