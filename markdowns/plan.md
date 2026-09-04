# Personal Finance Tracker — Project Plan & Handoff

> **Read this file first.** It is the compact index for the whole project and
> the handoff document for any fresh session. The three spec files hold the
> detail; this file holds the state.

**Last updated:** 2026-09-03 (all four documents authored; implementation not started)

---

## 1. What This Project Is

A personal finance tracker where a user logs in and immediately sees their bank
balances, income, expenses (viewable by day / week / month / year), budget
buckets with limits, loans given/borrowed, credit card outstanding, savings,
and goals. All money math is derived from transactions — nothing is hand-edited.

**v1 scope: manual entry only.** Inbox/SMS imports, voice input, recurring
transactions, and notifications are parked (plug-in points in `backend.md` §12).

**Stack:** React frontend · Spring Boot 4.x (Java 21, Maven) REST API ·
Supabase (hosted PostgreSQL + Auth).

---

## 2. Documentation Map

| File | Role | When to open it |
|---|---|---|
| `plan.md` | This file — status, decisions, handoff | Always, first |
| `schema.md` | Data model v2 — tables, columns, constraints, indexes, deletion policy, derived-calculation definitions | Building anything that touches data |
| `backend.md` | Spring Boot plan — modules, REST contract, calculation engine, validation matrix, errors, milestones | Building the backend |
| `frontend.md` | UI spec v2 — pages, layouts, charts, API contract per page, build order | Building the frontend |

**Reading order for a fresh session:** this file → the section of the relevant
spec you need → code. Do not re-derive decisions; Section 4 is final.

**Single source of truth rules:**

- Tables / constraints / indexes → `schema.md`
- Endpoints / validation / errors / calculations → `backend.md`
- Pages / layouts / UX rules → `frontend.md`
- If a change touches two docs, update `schema.md` first, then the others, and
  log it in Section 8 of this file.

---

## 3. Architecture at a Glance

```text
React (JWT)  ──HTTPS──►  Spring Boot API  ──JDBC/HikariCP──►  Supabase Postgres
     │                        │
     └── login only ──►  Supabase Auth (issues JWT; Spring validates it)
```

- The frontend talks to Supabase Auth (login/refresh) and the API (everything
  else). It never touches the database.
- The API is the security boundary: every query is scoped by the authenticated
  `user_id` in the service layer. RLS is not relied on.
- Layering: `controller → service (@Transactional, business rules) → repository
  (Spring Data JPA)`, schema owned by Flyway.

### Non-negotiable invariants

1. Seven transaction types: `INCOME`, `EXPENSE`, `TRANSFER`, `LOAN_GIVEN`,
   `LOAN_RECEIVED`, `LOAN_REPAYMENT_IN`, `LOAN_REPAYMENT_OUT`.
2. Income totals = Σ `INCOME` only. Expense totals = Σ `EXPENSE` only.
   Transfers and all `LOAN_*` types never enter income/expense/budgets.
3. Every loan and repayment is backed by a real transaction
   (`loans.transaction_id`, `loan_payments.transaction_id` NOT NULL).
4. Balances = `opening_balance + Σ(in) − Σ(out)`; credit card balance is
   negative = outstanding. One formula for all account types.
5. Budgets are recurring templates (one active per category per period type);
   usage is derived per viewed period.
6. Loan outstanding, goal progress, budget usage — always derived, never stored.
7. `LOAN_*` transactions are created only via loan endpoints; transaction type
   and loan original amount are immutable.
8. INR only, `NUMERIC(14,2)`, Asia/Kolkata, `transaction_date` is a DATE.
9. Goal contributions are allocations, not necessarily money movement; goals
   allocation must never be added to liquid cash in the UI.
10. Deleting follows the policy in `schema.md` §18 (deactivate-with-history,
    block referenced deletions with 409).

---

## 4. Locked Decisions (do not re-litigate)

| # | Decision | Choice | Where |
|---|---|---|---|
| 1 | Backend stack | Spring Boot 4.x, Java 21, Maven | `backend.md` §3 |
| 2 | Database | Supabase PostgreSQL, session pooler, HikariCP | `backend.md` §2.3 |
| 3 | Auth | Supabase Auth issues JWT; Spring validates as OAuth2 resource server; auto-provision `profiles` | `backend.md` §4 |
| 4 | Loans | Real money movement + explicit `LOAN_*` types | `schema.md` §8, §12 |
| 5 | Budgets | Recurring templates, no per-month rows | `schema.md` §10 |
| 6 | Entry mode v1 | Manual only; inbox/voice parked | `backend.md` §12 |
| 7 | Credit card | Account type; v1 metrics = outstanding + month spend + available credit; no billing-cycle statements | `schema.md` §9 |
| 8 | Currency / timezone | INR only / Asia/Kolkata | `schema.md` §20 |
| 9 | Dashboard | One aggregated endpoint + drill-down endpoints | `backend.md` §8.9 |
| 10 | Edits | Confirmed transactions editable, type immutable; no audit log in v1 | `schema.md` §18 |
| 11 | Recurring txns, alerts | Out of v1 | `backend.md` §1 |
| 12 | Frontend tooling | React 19 + Vite + TypeScript, Tailwind CSS v4, React Router 7, TanStack Query 5, Recharts, axios, supabase-js | `frontend.md` (whole file); user chose React/Vite/Tailwind, rest defaulted 2026-09-04 |

---

## 5. Integrated Build Plan

Backend milestones are from `backend.md` §13; frontend order from
`frontend.md` §23. Work them as thin vertical slices where possible.

| Phase | Backend | Frontend | Done when |
|---|---|---|---|
| P0 | M0 — scaffold, Flyway V1, JWT validation, profile provisioning, Swagger, health | — | `GET /me` returns a profile from a Supabase JWT |
| P1 | M1 — accounts, categories (+seed) | App shell, sidebar, API client, Login, Accounts page | Balances render for real accounts |
| P2 | M2 — transactions CRUD + validation | Transactions page + Add Transaction drawer | Can record income/expense/transfer and see totals |
| P3 | M3 — budget templates + usage, aggregated dashboard | Dashboard (all widgets), Budgets page | Dashboard fully renders from one call |
| P4 | M4 — contacts, loans, repayments (atomic) | Loans page (tabs, create, pay, timeline) | Loan create/repay moves balances correctly |
| P5 | M5 — goals + contributions | Savings & Goals page | Contributions update progress; transfers link |
| P6 | M6 — analytics endpoints | Analytics page (6 charts) | Charts respond to the period selector |
| P7 | M7 — error polish, indexes verified, seed script, integration tests | Settings page, drill-downs, polish | End-to-end pass on all flows |

---

## 6. Status Board

Update this section after every completed milestone — it is what a fresh
session trusts.

### Design

- [x] `schema.md` v2 — data model aligned
- [x] `backend.md` — modules, API contract, calculations
- [x] `frontend.md` v2 — pages + API contract map
- [x] `plan.md` — this handoff

### Implementation

- [x] P0 backend scaffold + auth wiring — *verified live: `GET /me` returned the provisioned profile from a real Supabase JWT; default categories seeded*
- [x] **Frontend complete 2026-09-04** — all §23 pages implemented in `frontend/` (Groww-style white-card UI, emerald/rose money semantics): shell+sidebar, Login, Dashboard (stat cards, needs-attention strip, bar+donut, budgets, balances, recent), Transactions (filters, date-grouped ledger, pagination, global add/edit drawer, LOAN_* read-only), Accounts (net position, list, detail w/ trend+card metrics, add/edit), Budgets (month nav, totals, status bars, detail w/ history chart + drill-down), Savings (liquid/investments/allocation, goals, contributions w/ optional linked transfer), Loans (tabs, receivable/payable headers, record modal w/ inline contact, timeline, payments), Analytics (6 charts + period selector), Settings (profile, categories one-level, contacts). `npm run build` green; **pending browser verification against the live backend**
- [ ] P1 accounts + categories · frontend shell/login/accounts — backend **implemented 2026-09-04** (Claude wrote it at the user's request, supersedes "user writes endpoints" for P1; compiles clean; pending live Postman verification). Frontend **tooling + shell scaffolded 2026-09-04** (`frontend/`: Vite + TS + Tailwind v4, Router, Query, Recharts, supabase-js; AppShell sidebar per frontend.md §3, LoginPage wired to Supabase Auth, JWT axios client, all 8 routes as placeholders; `npm run build` green). **Remaining for P1: the Accounts page.** Postman collection: `postman/finance-tracker-p1.postman_collection.json`
- [ ] P2 transactions · frontend transactions page — backend **implemented 2026-09-04** (CRUD + §9.1 validation matrix + summary + PeriodResolver; P1 upgrades included: derived balances, account detail moneyIn/out + trend + recent, deletion policies now transaction-aware). Compiles clean; pending Postman verification (`postman/finance-tracker-p2.postman_collection.json`). Frontend transactions page not started
- [ ] P3 budgets + dashboard · frontend dashboard/budgets — backend **implemented 2026-09-04** (`budget/` module: templates + usage engine + drill-down + history; `dashboard/` module: single aggregated call with all 9 widgets, loans section zeroed until P4). Compiles clean; pending Postman verification (`postman/finance-tracker-p3.postman_collection.json`). Frontend dashboard/budgets pages not started
- [ ] P4 loans + contacts · frontend loans page — backend **implemented 2026-09-04** (`contact/` CRUD + derived summary; `loan/` module with the four §9.3 atomic paths; dashboard `loansSummary` now real via `LoanService.portfolioTotals`). Compiles clean; pending Postman verification (`postman/finance-tracker-p4.postman_collection.json`). Frontend loans page not started
- [ ] P5 goals · frontend savings & goals — backend **implemented 2026-09-04** (`goal/` module: CRUD with service-managed COMPLETED status, contributions as allocations with optional linked-transfer id, §18 cancel-if-referenced deletion, cumulative progress series on detail). Compiles clean; pending Postman verification (`postman/finance-tracker-p5.postman_collection.json`). Frontend savings page not started
- [ ] P6 analytics · frontend analytics — backend **implemented 2026-09-04** (`analytics/` module: §8.10's five series endpoints, all `?periodType=&date=`; shared `PeriodResolver.buckets()` extracted; savings-progress cumulative line starts from contributions BEFORE the window). Compiles clean; pending Postman verification (`postman/finance-tracker-p6.postman_collection.json`). Frontend analytics page not started
- [ ] P7 polish, tests, settings — backend **implemented 2026-09-04**: error polish (§10 handlers for bad UUID/malformed JSON/unknown URL/method, 409 on DB conflicts, correlation-id 500s, problem+json 401/403 from security), index verification → `V2__lookup_indexes.sql` (categories, contacts), dev seeder (`seed/DevSeedRunner`, profile `dev` + `SEED_USER_ID`), 23 unit tests green (period windows, budget boundaries, §9.1 matrix, §9.3 loan paths). **Done-when remaining: run all six Postman collections end-to-end.** Testcontainers tests parked (need Docker). Frontend settings/polish not started

### Not started

- Supabase project creation, env setup, first migration run.

---

## 7. Handoff Protocol

For any session (human or AI) resuming this project with empty context:

1. **Read `plan.md` first.** Check the Status Board (§6) and Decision Log (§8).
2. **Never re-open settled questions.** §4 is final. If a decision truly must
   change, update the owning spec, every affected doc, and log it in §8.
3. **Pick the first unchecked item** in the Status Board and find its phase in
   §5. Open only the spec sections it needs:
   - Data shapes → `schema.md` (per-type rules §8.2, calculations §16)
   - Endpoint contract → `backend.md` §8 (validation §9, errors §10)
   - Screen behavior → `frontend.md` (page section + API contract block)
4. **Keep the docs consistent** — schema first, then backend, then frontend.
5. **Write down anything that survives the session** in §8 (one line per
   decision) and tick the board in §6 before context runs out. That is the
   whole point of this file.
6. **Don't trust memory over files.** If code and docs disagree, the docs win
   until you consciously change them (and log it).

### Quick environment reference

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://aws-0-<region>.pooler.supabase.com:5432/postgres
SPRING_DATASOURCE_USERNAME=postgres.<project-ref>
SPRING_DATASOURCE_PASSWORD=<db-password>
SUPABASE_PROJECT_URL=https://<project-ref>.supabase.co
CORS_ALLOWED_ORIGINS=http://localhost:5173
# SUPABASE_JWT_SECRET only if the project still uses legacy HS256 signing
```

Backend run: `mvn spring-boot:run` → Swagger at `/swagger-ui.html`, health at
`/actuator/health`.

---

## 8. Decision Log

Append-only. One line per decision made during implementation, newest last.
(Design-phase decisions live in §4.)

| Date | Decision | Reason |
|---|---|---|
| 2026-09-03 | Spring Boot 4.1.1 (Initializr default) instead of planned 3.x — new starter names: `webmvc`, `security-oauth2-resource-server`, `flyway` | Current stable line; docs updated |
| 2026-09-03 | springdoc pinned to 3.1.0 (the Boot 4 / Framework 7 compatible line) | Swagger needed for P0 verification |
| 2026-09-03 | JPA `ddl-auto: none` — Flyway owns the schema; consider `validate` in P1 once entity mapping is proven against real DB | Zero-risk first boot |
| 2026-09-03 | P0 code complete (migration, security, provisioning, `/me`, error handling) — compiles clean via `./mvnw compile` | Pending live run vs Supabase |
| 2026-09-03 | Live boot verified: Hikari connects via pooler (ap-southeast-2), Flyway schema at version 1, `/actuator/health` UP (includes DB check), `/api/v1/me` returns 401 without token | DB credentials + network path proven from this machine |
| 2026-09-04 | **P0 complete** — `/me` with a real JWT returned the provisioned profile (`fullName` null is expected: dashboard-created users have no name metadata). Next: P1 | Supabase Auth → Spring → Postgres chain proven end-to-end |
| 2026-09-04 | `SUPABASE_ISSUER` defaulted in application.yml (project URL is public info); env var now optional override | IntelliJ env var didn't reach the app; removed the boot dependency on it |
| 2026-09-04 | P1 onward: the user implements endpoints themselves; Claude reviews and debugs instead of writing code | This is a learning project — hands-on matters more than speed |
| 2026-09-04 | P1 scaffold: `account/` + `category/` stubs (controller/service bodies = numbered TODO steps + throw), entities/DTOs written in full; repository derived-query names left for the user | LeetCode-style stubs requested; entities/DTO shapes are spec, not logic |
| 2026-09-04 | P1 balance = `opening_balance` (no transaction entity exists until P2); account detail's money in/out, trend, recent txns deferred to P2 — noted in `AccountService` | Thin vertical slice; derived-balance upgrade is a P2 TODO |
| 2026-09-04 | P1 backend endpoints implemented by Claude at the user's explicit request (supersedes "user writes endpoints" for P1 only); stubs replaced with working code, compile clean, awaiting live Postman verification | User asked to "remove the comments and write appropriate backend code" |
| 2026-09-04 | P2 backend implemented same way: `transaction/` module (CRUD, filters via Specifications, summary), `common/PeriodResolver` + `PageResponse`, `BadRequestException` added to the exception family | User said "proceed p2" — continuation of the same arrangement |
| 2026-09-04 | P1 upgrades landed with P2: balances now derived (opening + Σin − Σout), account detail has moneyIn/out + balance trend + recent 10, account/category deletes deactivate when referenced | Explicit TODOs left in the P1 stubs; backend.md §6.2/§8.3, schema.md §18 |
| 2026-09-04 | Gotchas for future sessions: `common.ApiException` is ABSTRACT (throw `BadRequestException`/`NotFoundException`/`ConflictException`); Lombok on field `isActive` generates `setActive()`/`isActive()` — not `setIsActive()` | Both surfaced as compile errors during P2 |
| 2026-09-04 | P3 backend implemented (user: "go on to the p3"): `budget/` (templates, §6.5 usage engine, duplicate 409 backed by uq_budget_template, drill-down reuses TransactionService.list, history = N periods ending current, chronological) + `dashboard/` (read-only aggregator, §8.9) | Same arrangement as P1/P2 |
| 2026-09-04 | Dashboard `loansSummary` returns zeros until P4 builds the loan module; `monthSpend` = calendar month of the anchor date (§6.4 semantics held regardless of selected period); DAY series buckets hours with `transaction_time` null → hour 00 | Spec-ambiguity calls, recorded here |
| 2026-09-04 | P4 backend implemented (user: "start p4"): `contact/` + `loan/` modules; loan accountId resolved from the origin transaction (never stored, schema.md §12); overpayment rejected with 400; loans cannot involve CREDIT_CARD accounts (§9.1); repayment POST returns the full updated timeline | Spec-ambiguity calls: overpayment rule is not in the specs — chosen as 400 to keep outstanding ≥ 0; recorded here |
| 2026-09-04 | P4 dashboard: `loansSummary` wired to `LoanService.portfolioTotals` (Σ outstanding of ACTIVE loans by direction) — the P3 zeros note is superseded | §6.6 |
| 2026-09-04 | P5 backend implemented (user: "proceed with p5"): `goal/` module. Rules chosen where spec is silent: contributions to CANCELLED goals → 400; client may set status only ACTIVE/CANCELLED (COMPLETED is service-managed, 400 otherwise); contribution `transactionId` is ownership-validated (404); contribution POST returns the refreshed detail (progress + cumulative series) | Spec-ambiguity calls, recorded here |
| 2026-09-04 | P6 backend implemented (user: "proceed with p6"): `analytics/` with §8.10's five endpoints. Decisions: savings-progress cumulative line is based on ALL contributions before the window (true progress-over-time, not window-reset); account-cashflow covers ACTIVE accounts with zero-filled totals; bucket labels are bucket START dates (daily = the day, monthly = 1st). `PeriodResolver.buckets()` extracted as the shared daily/monthly bucketing helper | Spec-ambiguity calls, recorded here |
| 2026-09-04 | P7 backend implemented (user: "ok proceed p7"). Index verification verdict: V1 covered all §17 paths except `categories(user_id)` and `contacts(user_id)` → added as `V2__lookup_indexes.sql` (V1 immutable). Security errors now return problem+json (401 entry point + 403 access-denied handler). `BackendApplicationTests` demoted from @SpringBootTest contextLoads (needs live Supabase) to a context-free smoke test | M7 scope |
| 2026-09-04 | Testcontainers integration tests DEFERRED — needs Docker on the machine; unit tests cover the §6 calculation helpers, §9.1 matrix, and §9.3 loan paths (23 tests green). Revisit if/when Docker is available | Environment constraint, not a design call |
| 2026-09-04 | **Backend feature-complete: M0–M7 all implemented.** Remaining project work is frontend (P1–P7 frontend columns) + running all six Postman collections for the end-to-end pass | Status at end of this session |
| 2026-09-04 | Frontend started (user: "use the react + vite + tailwind css"): scaffolded `frontend/` with the §4 tooling row; env vars are `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_API_BASE_URL` (anon key still user-pasted in `frontend/.env`); API 401 signs the session out | User's tooling choice + defaults logged as decision #12 |
| 2026-09-04 | All frontend pages implemented at the user's request ("like groww.com, high end investment pages"). Decisions: server state 100% TanStack Query (mutations invalidate the entire cache — balances/budgets/goals are all derived, so anything can change after any write); savings overview computed client-side from /accounts + /goals (§16 formulas); loans page totals computed from the ACTIVE loans list instead of calling /dashboard; ledger LOAN_* rows open a read-only view linking to /loans (§12); contribution modal implements the §16 "money actually moved" two-step (TRANSFER first, then link its id). Known gaps: inactive accounts can't be listed (API lists active only) so reactivation has no UI; oxlint reports only fast-refresh/set-state style warnings | Build green; browser verification pending |
| 2026-09-04 | Two build/runtime bugs found via IntelliJ diagnostics + browser ERR_CONNECTION_REFUSED: (1) 4 real compile errors (SecurityConfig lambda param types, DevSeedRunner contact.id()) had been masked by stale incremental compilation — `mvn clean test` is now the trusted check; (2) DevSeedRunner killed the whole app on a bad SEED_USER_ID — profiles.id is a FK to auth.users, so seeding now fails gracefully with a clear log line and the app starts unseeded. SEED_USER_ID must be a real Supabase user UID | User-reported; fixed and verified via clean boot |
| 2026-09-04 | User self-signup added to the Login page (supersedes frontend.md §4's "no register page in v1", which was updated): `supabase.auth.signUp` toggle. Note for the user: if email confirmation is ON in Supabase (Auth → Providers → Email), a new signup must confirm via email before a session exists; "Allow new users to sign up" must also be ON. New users are auto-provisioned by the backend on first API request | User asked "why new users cant be added" |
