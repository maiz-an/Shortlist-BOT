# Contributing to Shortlist BOT

Thanks for helping. This is a small, local-first project; keeping changes focused makes them easy to review.

## Get it running
Follow [SETUP.md](SETUP.md). Ports are 5870 (app), 5871 (API), 5872 (built-in database).

## Before you open a pull request
```bash
cd backend  && npm run typecheck && npm test
cd frontend && npm run build          # type-checks, then builds
```
CI runs the same checks on every push and pull request.

## Guidelines
- **One change per pull request**, with a clear description of what and why.
- **Add tests** for backend logic (scoring, dedup, validation, status rules). Pure functions are easy to test; see `backend/src/__tests__`.
- **Keep prompts in** `backend/src/modules/ai/prompts/` and keep business code independent of Ollama (use the `AIProvider` interface). The same goes for email (`EmailProvider`) and job sources (`JobSource`).
- **Never call a job site aggressively.** New sources must be rate limited, stop on HTTP 429, and must not log in, bypass CAPTCHAs or scrape private data.
- **Sending must stay safe.** Sending needs an explicit confirmation, except Auto-apply, which must stay off by default and pass every rule in `auto-apply.service.ts` (and be tested).
- **No secrets in commits.** `.env` files and Google `client_secret*.json` are ignored; double check `git status` before committing.
- **UI:** keep it plain and readable, follow the existing tokens in `frontend/tailwind.config.js`, support keyboard use, and respect reduced motion.

## Adding a job source
Implement `JobSource` (`key`, `name`, `search(criteria)`) in `backend/src/modules/job-sources/`, register it in `JOB_SOURCES` in `job-sources.module.ts`, and add tests for malformed data and source failure.

## Commit messages
Short imperative subject (`Add Bayt source`), then a body explaining why when it is not obvious.

## Versioning and releases
[Semantic Versioning](https://semver.org). The `VERSION` file is the source of truth; keep `backend/package.json`, `frontend/package.json` and the version shown on the App health page in sync. Every release gets a [CHANGELOG.md](CHANGELOG.md) entry and a tag:

- **PATCH**: bug fixes and internal changes.
- **MINOR**: new features, or changes that need users to edit their `.env` (say so in the changelog).
- **MAJOR**: breaking changes to stored data or the API.

```bash
git tag -a vX.Y.Z -m "Shortlist BOT X.Y.Z" && git push origin main vX.Y.Z
```

## Reporting problems
Open an issue using the templates. For security problems, see [SECURITY.md](SECURITY.md) instead.
