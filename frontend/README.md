# Shortlist BOT: frontend

React + Vite + TypeScript + Tailwind CSS 3. See the [setup guide](../SETUP.md).

```bash
npm install
npm run dev      # http://localhost:5870
npm run build    # type-check and production build
```

Notes: Tailwind 3 and Vite 6 are used on purpose. Their bundlers have no native binaries, so the frontend also builds on machines that block unsigned programs (see `overrides` in `package.json`).
