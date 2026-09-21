# NextUp

Who owns what, and what is waiting on whom. An employee raises a case in one field, it lands in
the right leader's inbox with a clock, the leader answers, management sees the wait ledger.

Next.js 16 (App Router, TypeScript), no CSS framework - tokens + CSS Modules.
`docs/PLAN.md` is the roadmap; `docs/ARCHITECTURE.md` explains the folders; `docs/ROUTES.md`
and `docs/DATA_MODEL.md` are the map. Process rules: `CONTRIBUTING.md`. AI sessions: `CLAUDE.md`.

## Run

No database needed - it falls back to the built-in `acme` demo:

```bash
npm install
npm run dev          # http://localhost:3000/acme
```

The whole stack - Postgres, n8n, a mail catcher and TLS - is one command, and gives every
company its own subdomain. See **[docs/DEPLOY.md](docs/DEPLOY.md)**:

```bash
cp .env.example .env
docker compose up --build     # http://acme.localhost, http://admin.localhost
```

| Script | What |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` / `npm start` | production build / serve it |
| `npm run lint` · `npm run typecheck` · `npm test` | what CI runs (all database-free) |
| `ops/test-db.sh` | the database-backed suite, kept out of `npm test` |
| `npm run demo` | the old static demo at http://localhost:8765 (`legacy/demo/`) |

Demo company: `/acme`, log in at `/acme/login` with its access code. New companies are added in
`/admin` and are live immediately - no deploy.

## Layout

```
src/app/            routes - (marketing) · (auth) · [company]/login · [company]/(app)/{manager,leader,team,...} · api
src/components/     React: ui · marketing · auth · shell · dashboard/{manager,leader,team,shared}
src/features/       domain logic per entity (tenant, routing, metrics, cases, ...) - no React in here
src/config/         roles.ts (ROLE_HOME, ROLE_ACCESS) · nav.ts · site.ts
src/lib/            db client, utils          src/server/actions/   server actions (validate -> auth -> features)
src/styles/         design tokens             src/types/            domain types
prisma/  public/  tests/{unit,e2e}  docs/
legacy/demo/        the static dashboard demo, unchanged, still used for sales calls
```

Rule of thumb: **pages fetch, components render, features decide.**
