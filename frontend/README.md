# Frontend — Finance Tracker

React 19 + TypeScript + Vite SPA. Tailwind CSS v4 for styling, Recharts for
charts, TanStack Query for server state, Supabase JS for auth only — all data
comes from the Spring Boot API (`VITE_API_BASE_URL`).

Project overview & setup: the [root README](../README.md) · UI spec:
`../markdowns/frontend.md` · API spec: `../markdowns/backend.md`.

## Develop

```bash
cp .env.example .env   # fill in Supabase URL/anon key + API base URL
npm install
npm run dev            # http://localhost:5173
```

`VITE_*` variables are inlined at build time — restart the dev server after
changing `.env`.

| Script | What |
|---|---|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | `tsc -b` type-check + production build |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build |

## Code map

```text
src/
├── main.tsx            Provider stack: Theme → Query → Auth → Router
├── App.tsx             Routes (lazy-loaded pages) + the /reset-password pre-auth gate
├── index.css           Tailwind v4: brand tokens, dark variant, income/expense tokens
├── theme/              ThemeContext — light/dark, localStorage + OS preference
├── auth/               AuthContext — Supabase session
├── components/
│   ├── ui.tsx          Shared primitives: Card, Badge, Modal, StatCard, input/button classes
│   ├── AppShell.tsx    Sidebar layout (owns the theme toggle + logout)
│   └── TransactionDrawer.tsx  Add/edit transaction modal, opened from anywhere
├── pages/              One file per route (dashboard, transactions, accounts, …)
└── lib/
    ├── api.ts          Axios instance (attaches the Supabase JWT)
    ├── queries.ts      TanStack Query hooks per endpoint
    ├── chartTheme.ts   Recharts palettes per theme (charts need JS props, not CSS)
    └── format.ts       INR/date formatting helpers
```

## Conventions

- **Theming** — dark mode is class-based (`.dark` on `<html>`). Use plain
  `dark:` utilities for surfaces/text; for income/expense amounts use the
  `text-income` / `text-expense` tokens (they flip automatically — dark mode
  shows neon green income and a readable red expense). Danger shares the red
  family; transfer stays blue and loan amber. Chart colors come from
  `chartTheme()` — never hardcode hexes. See the root README's "Dark theme"
  section.
- **Brand green** — `--color-brand-*` tokens in `index.css`; buttons, focus
  rings and the active nav pill all share them. Small green text uses
  `brand-700` for contrast; white-on-green stays on the large CTA only.
- **Server state** — always through a `queries.ts` hook; components never
  call Axios directly.
- **New pages** — lazy route in `App.tsx`, a named export, and `PageHeader` +
  `Card` primitives so theming comes for free.

## Deploy (Vercel)

SPA rewrites live in `vercel.json`. Define `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` and `VITE_API_BASE_URL` in the Vercel project, then
redeploy. The backend's `CORS_ALLOWED_ORIGINS` must include the Vercel
origin, and Supabase Auth → Redirect URLs must list it too.
