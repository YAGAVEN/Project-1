# Finance Tracker

A personal finance tracker: log in and immediately see your bank balances,
income, expenses (day / week / month / year), budget buckets with limits,
loans given & borrowed, credit-card outstanding, savings goals — and analytics
over all of it. **All money math is derived from transactions; nothing is
hand-edited.**

v1 scope is manual entry. SMS/inbox imports, recurring transactions and
notifications are parked — see `markdowns/backend.md` §12 for the plug-in
points.

## Features

- **Dashboard** — total balance, income, expenses, net cash flow, budget
  overview, account balances, recent transactions, a "needs attention" strip
- **Transactions** — filterable ledger with an add/edit drawer (expense /
  income / transfer); loan movements are recorded from the Loans page
- **Accounts** — bank accounts, wallets and credit cards with outstanding &
  available credit; per-account cash flow and ledgers
- **Budgets** — monthly category budgets with OK / WARNING / OVER status
- **Savings** — goals with contributions and progress tracking
- **Loans** — money lent / borrowed with repayment timelines and contact
  summaries
- **Analytics** — income vs expense, spending trend, category donut,
  category comparison, savings progress, per-account cash flow
- **Light & dark theme** — Groww-style dark mode (neon green income, red
  expense) with a toggle in the sidebar, on the auth screens and in Settings

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, TanStack Query, React Router 7, Supabase JS, Axios |
| Backend | Spring Boot 4 (Java 21, Maven), Spring Security (JWT resource server), Flyway, springdoc OpenAPI |
| Data & auth | Supabase — hosted PostgreSQL + Supabase Auth (JWT) |
| Hosting | Frontend on Vercel · API on Render · DB/Auth on Supabase |

```text
Browser ──► React SPA (Vercel)
              ├─ Supabase JS: sign-up / login / forgot-password (PKCE) ──► Supabase Auth
              └─ Axios + Bearer JWT ──► Spring Boot REST API (Render)
                                           ├─ validates the Supabase JWT (resource server)
                                           ├─ Flyway migrations
                                           └─ Supabase PostgreSQL (session pooler)
```

The API never sees a password. The SPA gets a JWT from Supabase Auth and the
backend validates it; the first authenticated request auto-provisions the
user's profile row and default categories.

**Current deployments:** frontend `https://fin-track-three-tawny.vercel.app`
· API `https://project-1-jfr5.onrender.com`. The API is on Render's free tier
and spins down when idle — the first request after idle takes ~50s (cold
start, not a failure).

## Repository layout

```text
├── frontend/           React SPA (this repo's UI)
│   └── src/
│       ├── auth/       Supabase session context
│       ├── theme/      Light/dark theme provider
│       ├── components/ AppShell, UI primitives (ui.tsx), drawer, modals
│       ├── pages/      One file per route (dashboard, accounts, budgets, …)
│       └── lib/        API client, TanStack Query hooks, formatting, charts
├── backend/            Spring Boot REST API (see backend/README.md)
│   └── src/main/resources/db/migration/   Flyway SQL migrations
├── markdowns/          Project specs & handoff docs (read plan.md first)
└── postman/            Postman collections per project phase
```

## Getting started

### Prerequisites

- Node 20+ and npm
- Java 21 (the API will not start on 17)
- A free [Supabase](https://supabase.com) project

### 1. Database & auth (Supabase)

1. Create a project, then from **Project Settings → Database** note the
   **session pooler** connection string and DB password.
2. From **Project Settings → API** note the project URL and anon key.
3. From **Auth → URL Configuration**, add the redirect URLs you will serve
   the app from (e.g. `http://localhost:5173`, `/reset-password` included).
4. Schema is owned by Flyway — no manual SQL needed. On first backend boot
   `V1__init.sql` creates all tables.

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # then fill in the three values
npm install
npm run dev                 # http://localhost:5173
```

| `.env` variable | Meaning |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_API_BASE_URL` | Spring Boot API base, e.g. `http://localhost:8080/api/v1` |

> Vite inlines `VITE_*` variables **at build time** — after changing them,
> restart the dev server (and redeploy, for hosted builds).

### 3. Backend

```bash
cd backend
./mvnw spring-boot:run      # or the run button in IntelliJ
```

Set these environment variables (root `.env` is a template — copy the values
into your run configuration; **never commit real secrets**):

| Variable | Value |
|---|---|
| `SPRING_DATASOURCE_URL` | Session-pooler JDBC URL (`jdbc:postgresql://aws-0-<region>.pooler.supabase.com:5432/postgres`) |
| `SPRING_DATASOURCE_USERNAME` | Pooler user `postgres.<project-ref>` |
| `SPRING_DATASOURCE_PASSWORD` | DB password |
| `SUPABASE_ISSUER` | `<project-url>/auth/v1` (preferred JWT mode: asymmetric keys) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins, e.g. `http://localhost:5173` |

Legacy HS256 JWT alternative: unset `SUPABASE_ISSUER` and set
`SUPABASE_JWT_SECRET` instead. With neither set the app refuses to start with
a clear message. Details: [`backend/README.md`](backend/README.md).

Free-tier gotcha: Supabase caps session-pooler connections — run only **one**
local backend at a time alongside Render (the pool size is tunable via
`DB_POOL_MAX`).

### 4. Verify

- `GET http://localhost:8080/actuator/health` → `{"status":"UP"}` (no token)
- `http://localhost:8080/swagger-ui.html` (no token)
- Any other endpoint without a token → `401`
- Log in through the app; the first request provisions your profile + 14
  default categories

## Scripts

| Where | Command | What |
|---|---|---|
| `frontend/` | `npm run dev` | Vite dev server with HMR |
| `frontend/` | `npm run build` | Type-check (`tsc -b`) + production build |
| `frontend/` | `npm run lint` | oxlint |
| `frontend/` | `npm run preview` | Serve the production build locally |
| `backend/` | `./mvnw spring-boot:run` | Run the API |
| `backend/` | `./mvnw clean test` | Tests (needs the same env vars — they hit the real DB) |

## Dark theme — how it works (for contributors)

- `src/index.css` declares the class-based variant
  (`@custom-variant dark`) and the `--income` / `--expense` tokens, which
  flip per mode and are exposed to Tailwind via `@theme inline` — call sites
  just write `text-income` / `text-expense` (light: emerald/rose, dark:
  Groww neon green `#00e09e` / red `#fb7185`).
- `src/theme/ThemeContext.tsx` persists the choice to `localStorage`
  (`ft-theme`), defaults to the OS preference, and toggles `.dark` on `<html>`.
  `index.html` has a mirrored pre-paint script so there is no light flash on
  reload — keep the two in sync.
- Surfaces are plain `dark:` utilities (slate-950 app / slate-900 cards /
  slate-800 hovers). Shared primitives live in `ui.tsx`, so most pages
  inherit their theming from there.
- Charts can't use CSS classes (Recharts wants JS props), so
  `src/lib/chartTheme.ts` returns the full palette per mode and pages pick
  from it via `useTheme()`.
- Expense amounts are red in both modes (rose-600 light / rose-400 dark).
  Danger (delete, errors) shares the red family, as in light mode; transfer
  stays blue and loan amber everywhere.

## Documentation map

| File | Role |
|---|---|
| `markdowns/plan.md` | Status, decision log, handoff — **read first** |
| `markdowns/schema.md` | Data model: tables, constraints, indexes, derived calculations |
| `markdowns/backend.md` | REST contract, validation matrix, error model, milestones |
| `markdowns/frontend.md` | Page layouts, UX rules, chart inventory, API usage per page |

If a change touches a spec, update the owning doc (`schema.md` first, then
`backend.md`/`frontend.md`) and log the decision in `plan.md` §8.

## Contributing

1. Branch off `main` (e.g. `yaga`, or `feat/<thing>`).
2. Commit style: `feat : <what>` / `fix : <what>` (matches existing history).
3. Before opening a PR: `npm run build` and `npm run lint` in `frontend/`
   must pass, and `./mvnw clean test` in `backend/` (with env vars set).
4. Keep the docs honest — UI changes belong in `markdowns/frontend.md`, data
   changes in `markdowns/schema.md`, and every non-obvious decision gets a
   row in `plan.md` §8.
5. Open a PR against `main` with a short description and screenshots for UI
   changes (both themes, if it affects them).
