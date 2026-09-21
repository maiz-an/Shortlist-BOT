# Security policy

Shortlist BOT runs on your own computer and can send email from your Gmail account, so security matters.

## Supported versions
Only the latest release receives fixes.

## Reporting a vulnerability
Please **do not open a public issue** for security problems. Use GitHub's private reporting: **Security, Report a vulnerability** on this repository. Include what you found, how to reproduce it, and the version (`VERSION` file). You should get a reply within a few days.

## What is protected
- The local API needs an `X-Api-Token` header and listens on `127.0.0.1` only. CORS allows only the configured app address.
- Gmail access uses OAuth with the send-only permission. No password is requested or stored, and tokens are encrypted at rest (AES-256-GCM).
- Requests are validated; HTML in job text and user input is stripped; CV uploads are limited to PDF/DOC/DOCX up to 5 MB and checked by content.
- Logs redact tokens and secrets. The database viewer hides token columns.
- Applications are sent only after your explicit confirmation, or automatically if you switch on Auto-apply (off by default, with safety rules and a daily limit).
- Optional passcode login (`ACCESS_PASSCODE`) with signed, expiring, HTTP-only session cookies and rate-limited attempts; required for remote use.

## Your part
- Keep `backend/.env`, `frontend/.env` and any Google `client_secret*.json` private. They are git-ignored; never commit or share them.
- Do not expose ports 5870 to 5872 to the internet or open them on your router. The supported way to reach the app from another device is remote mode (needs `ACCESS_PASSCODE`) over a private network such as Tailscale. There is no multi-user access control.
- If you think a token leaked, disconnect Gmail in the app and remove the app's access at https://myaccount.google.com/permissions, then rotate `API_TOKEN` and `TOKEN_ENCRYPTION_KEY`.
