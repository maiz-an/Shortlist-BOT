# Shortlist BOT

**A local-first job application assistant.** It finds jobs, removes duplicates, reads each one with a local AI model, picks the right CV, drafts the email, and lets you review and send it from your own Gmail. Everything runs on your computer. No paid APIs, no cloud, nothing is sent without your say-so (auto-apply is off unless you turn it on).

![version](https://img.shields.io/badge/version-1.6.0-265496)
![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![CI](https://github.com/maiz-an/Shortlist-BOT/actions/workflows/ci.yml/badge.svg)

```
Find job  →  Analyze  →  Pick CV  →  Draft email  →  You review  →  Send  →  Track
```

## Features

- **Collect** jobs from free public sources through a pluggable `JobSource` interface (LinkedIn public listings, plus optional Indeed via JobSpy), rate limited and failure tolerant.
- **Deduplicate** across sources by source ID, URL, normalized company/title/location and description similarity.
- **Analyze** every job with a local [Ollama](https://ollama.com) model (`qwen3:8b`) behind an `AIProvider` interface, with strictly validated output.
- **Score** with a deterministic layer (skills, title, experience, location, job type, CV fit, excluded keywords). The AI advises; the backend decides. Score bands are configurable.
- **Choose the best CV** from your CV profiles (files are stored locally, never in the database).
- **Draft honest emails** that only claim skills present on the selected CV, then edit before sending.
- **Send through your Gmail** with OAuth (send-only permission, tokens encrypted). A confirmation dialog shows recipient, subject, body and attachment first.
- **Track** every application: status workflow and history, notes, follow-up and interview dates.
- **Automate** searches on a schedule. Auto-apply is **off by default**; if you turn it on it only sends when strict safety rules all pass (see Settings).
- **Use it on your phone** (experimental): passcode login and a private Tailscale address. See [SETUP.md](SETUP.md#use-it-from-your-phone).
- **See everything**: dashboard, an **App health** page (frontend, backend, database, AI model, Gmail, with fixes), and a read-only **Database** browser with CSV/JSON export.

## Quick start

Full walkthrough (including a no-admin database option, Ollama and Gmail): **[SETUP.md](SETUP.md)**.

```bash
git clone https://github.com/maiz-an/Shortlist-BOT.git && cd Shortlist-BOT
cd backend && npm install && npm run init-env      # then set DATABASE_URL in backend/.env
npm run db:setup && npm run start:dev               # terminal 1
cd ../frontend && npm install && npm run dev        # terminal 2
```

Needs Node.js 20+, PostgreSQL (or the built-in option in `Setup/`) and Ollama with `ollama pull qwen3:8b`.
Open **http://localhost:5870** (use `localhost`, not `127.0.0.1`).

Ports are deliberately uncommon so it can run next to your other projects: app **5870**, API **5871**, built-in database **5872**. See [Ports](SETUP.md#ports).

## Documentation

| | |
|---|---|
| [SETUP.md](SETUP.md) | Install, configure, connect Gmail, troubleshoot, update |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version (and any action needed when upgrading) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development workflow, tests, versioning |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability, and what is protected |

## Tech stack

React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, framer-motion · NestJS, Prisma, PostgreSQL · Ollama · Gmail API.

## How it is organized

```
backend/src/modules/
  ai/            AIProvider interface, Ollama provider, prompts (ai/prompts/)
  job-sources/   JobSource interface, LinkedIn source
  jobs/          normalization and deduplication
  job-analysis/  AI analysis -> CV selection -> scoring -> analysis queue
  search/        search profiles, runner, scheduler
  email/         EmailProvider interface, Gmail provider, draft generation, sending
  applications/  status workflow and history
  cv-profiles/   CV profiles and file storage
  dashboard/  health/  database/  settings/
frontend/src/    pages, features (api hooks + components), shared UI kit
Setup/           built-in local database for machines that cannot install PostgreSQL
```

Extending it: implement `JobSource`, `AIProvider` or `EmailProvider` and register it. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing

```bash
cd backend  && npm run typecheck && npm test    # 61 tests: normalization, dedup, scoring,
                                                # CV selection, AI JSON validation, source failures,
                                                # email generation, status changes
cd frontend && npm run build
```

## Roadmap

More job sources (Indeed, Bayt, GulfTalent, company career pages) · more email providers · OpenAI/Anthropic providers · local model selection in the UI · optional auto-apply above a chosen score · browser extension · multi-user support.

## Responsible use

Shortlist BOT reads publicly visible listings gently (rate limited, stops on HTTP 429) and does not log in to job sites or bypass CAPTCHAs. You are responsible for following each site's terms of use and for the emails you choose to send. It is not affiliated with LinkedIn, Google or Ollama.

## License

[MIT](LICENSE)

---
<sub><i>a Maiz's one</i></sub>
