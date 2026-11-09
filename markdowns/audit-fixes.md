# Audit Fix Implementation Log

Companion to the 2026-10-12 comprehensive audit. One section per phase; each
records what changed, the evidence, and what still needs production access.
Nothing here is deployed or committed until explicitly approved.

Status legend: ✅ done · 🔶 written, needs environment · ⬜ pending · 🚫 blocked

---

## Phase 1 — Critical security: Row Level Security (P0)

### Finding

All 10 public tables were readable AND writable through Supabase's auto-REST
API (`/rest/v1/*`) with only the public anon key that ships inside the SPA
bundle — RLS was disabled and Supabase's default privileges grant full table
access to the `anon`/`authenticated` roles. Verified against production on
2026-10-12: HTTP 200 with real rows on every table (status codes and row
counts only; no record contents read or printed):

`profiles · accounts · categories · transactions · budgets · contacts ·
loans · loan_payments · savings_goals · goal_contributions`

### Fix — `V3__enable_rls_backend_only.sql` (new Flyway migration)

DDL only; touches no rows. For each of the 10 tables:

1. `enable row level security`
2. `create policy deny_client_rest_access … to anon, authenticated using (false) with check (false)`
3. `revoke all … from anon, authenticated` (tables + sequences)

**Why the backend keeps working:** the Spring backend connects as role
`postgres` (session-pooler user `postgres.<project-ref>`), which owns every
table (Flyway created them). Table owners bypass RLS unless
`FORCE ROW LEVEL SECURITY` is set — deliberately **not** set. The migration is
also re-runnable by hand against Supabase before a deploy: `drop policy if
exists` precedes every `create policy`, so Flyway applying it afterwards is a
no-op.

**Auth flows unaffected:** the SPA's supabase-js client calls only
`/auth/v1/*` (auth schema), never `/rest/v1/*`; the anon key stays valid for
authentication.

### Verification (executed 2026-10-12)

* **PGlite run (real PostgreSQL, the exact V1+V2+V3 files) — 37/37 checks
  passed**, covering: RLS-on/FORCE-off catalog flags (10 tables); grants
  revoked → anon SELECT = permission denied; grants re-added → anon reads 0
  rows through the deny policy (defense in depth); anon INSERT → RLS
  with-check violation; authenticated role denied; backend owner path
  (profile → account → income transaction → derived-balance aggregate)
  works and returns the correct balance. Harness: `/tmp/rls-verify/verify.mjs`
  (scratch, not committed).
* **`RowLevelSecurityMigrationTest`** (`backend/src/test/java/.../db/`) —
  the same matrix as a JUnit test, gated on
  `RLS_IT_JDBC_URL`/`RLS_IT_USER`/`RLS_IT_PASSWORD`/`RLS_IT_ALLOW_RESET=true`
  (setup drops/recreates the scratch `public` schema). Runs in CI against a
  postgres service container (Phase 6). Local run: compiles, 6/6 skipped
  without env vars — 🔶 awaiting a scratch database.
* **`rls-verification.sql`** (`backend/src/test/resources/db/`) — standalone
  psql script for ad-hoc post-migration checks.
* **Backend build/tests:** `./mvnw clean test` green under JDK 26 — 26/26
  passed (BackendApplicationTests 1, BudgetStatusTest 3, PeriodResolverTest
  11, TransactionServiceValidationTest 8, LoanServicePaymentTest 3). The
  audit's "11 errors" were a JDK-17 runtime loading Java-21 bytecode; no JDK
  21 exists on this machine — CI must pin 21 (Phase 6).
* **Pre-migration exposure evidence:** anon-key REST probe = HTTP 200 on all
  10 tables (kept for before/after comparison).

### Production deployment procedure (requires approval)

1. Merge the phase branch → Render auto-deploys → Flyway applies V3 at boot
   (log line: `Successfully applied 1 migration` → `Migrating schema
   "public" to version "3 - enable rls backend only"`).
2. Post-deploy read-only checks:
   - Anon-key REST probe (same 10 URLs) → expect **HTTP 403** on every table
     (grants revoked; would be 200 + `[]` if only policies applied).
   - Supabase SQL editor (read-only):
     `select relname, relrowsecurity, relforcerowsecurity from pg_class
      where relname in ('profiles','accounts','categories','transactions',
      'budgets','contacts','loans','loan_payments','savings_goals','goal_contributions');`
     → `true, false` on every row. And
     `select count(*) from pg_policies where schemaname='public';` → `10`.
   - Backend functional smoke: log into the SPA, dashboard loads, add a
     ₹1.00 synthetic transaction, verify balance/budget refresh, delete it.
3. Expected user impact: none (backend path verified; REST clients were never
   a supported access path).

### Rollback

Migration is DDL-only; rollback is the exact inverse, run in the Supabase SQL
editor (Flyway history stays untouched — V3 remains recorded as applied):

```sql
begin;
do $$ declare t text; begin
  foreach t in array array['profiles','accounts','categories','transactions',
    'budgets','contacts','loans','loan_payments','savings_goals','goal_contributions']
  loop
    execute format('drop policy if exists deny_client_rest_access on %I', t);
    execute format('alter table %I disable row level security', t);
    execute format('grant all privileges on %I to anon, authenticated', t);
  end loop;
end $$;
grant usage on all sequences in schema public to anon, authenticated;
commit;
```

⚠️ Rollback restores the vulnerability — only use if the backend is broken
and cannot be fixed quickly.

### Pending from Phase 1

- ⬜ schema.md note documenting the RLS policy model (doc-sync before merge).
- ⬜ CI service-container wiring so `RowLevelSecurityMigrationTest` actually
  executes (Phase 6).
- ⬜ Optional hardening: set Supabase "Exposed schemas" to remove `public`
  from the API entirely (dashboard-side, no migration needed).

---

## Phase 2 — Financial correctness ✅ (2026-10-12, approved & implemented)

### 2.1 UTC/local dates (H-1/H-2) — ✅

* `frontend/src/lib/format.ts` rewritten: `todayISO()` now builds the LOCAL
  calendar date (injectable `now` for tests); new `addDaysISO`/`addMonthsISO`
  do pure ISO date-string arithmetic (no UTC round-trip, month-end clamped:
  Jan 31 + 1M = Feb 28/29, year-shifts included); `shiftAnchor` delegates to
  them; `formatDateLabel` derives "Yesterday" from the same math.
* Deduplicated: `BudgetsPage.shiftMonth` deleted → `shiftAnchor('MONTH', …)`;
  `LoansPage` raw `toISOString().slice(0,10)` → `todayISO()`. The
  `outbox.ts` `queuedAt` timestamp is a full instant, intentionally untouched.
* Tests: `frontend/src/lib/format.test.ts` — 17 tests (local-midnight
  regression, month/year boundaries, leap years, dead-arrow regression,
  clamping, week integrity, formatINR guards).

### 2.2 Retry + idempotency (H-3) — ✅

* `frontend/src/lib/api.ts`: rewritten as a `createApiClient` factory. The
  re-entrancy marker now lives ON the config (`__ftRetried`, a string key that
  survives axios's `mergeConfig`) — retries can no longer nest; automatic
  retries are **GET-only** (writes surface errors / fall back to the outbox);
  Supabase import made lazy so the module is env-free for tests.
* Server-side idempotency: `V4__idempotency_keys.sql` (RLS-hardened from
  birth) + `idempotency/IdempotencyKey` (+`Id` embeddable with proper
  equals/hashCode — added after the test suite caught its absence, which also
  satisfies the JPA embeddable contract) + `IdempotencyKeyRepository` +
  `IdempotencyService` (sha-256 request hash; 409 on key reuse with a
  different payload; 409 on in-flight duplicate; atomic claim→write→capture
  in one DB transaction). `TransactionController` accepts an optional
  `Idempotency-Key` header; `TransactionService.createIdempotent` replays the
  stored 201 response for completed keys.
* Frontend integration: `useCreateTransaction` generates the client UUID up
  front and sends it as the header; the outbox flush re-sends the SAME key
  (`entry.clientId`), so a committed-but-lost response can never double-create.
* Tests: `IdempotencyServiceTest` (8) — hash stability, replay, hash-mismatch
  409, in-flight 409, claim shape, completion capture, round-trip;
  `TransactionServiceValidationTest$IdempotentCreate` (4) — no-key parity,
  claim-create-capture, replay-without-create, payload-mismatch 409;
  `api.test.ts` (7) — GET retry, token per attempt, POST/DELETE never retried,
  4xx not retried (this test caught a regression in my own rewrite — the
  pre-loop `isRetryable` check — fixed), bounded linear retry count
  (nesting regression guard).
* PGlite run: 6/6 V4 checks passed (table, RLS flags, deny policy, anon
  denial, composite-PK uniqueness, PENDING default).

### 2.3 Linked-transaction protection (H-4) — ✅

* `TransactionService.update/delete` now reject transactions referenced by
  `loans`, `loan_payments`, or `goal_contributions` with actionable 409s
  naming the owning module (`assertNotLinked`). Repo additions:
  `existsByTransactionId` on Loan/LoanPayment/GoalContribution repositories
  (repository-level only — dependency graph stays acyclic).
* Loan/goal endpoints untouched — their atomic paths keep working.
* Tests: `TransactionServiceValidationTest$LinkedTransactionProtection` (12):
  loan-origin update blocked, repayment delete blocked, goal-linked delete
  blocked, unlinked transactions unchanged.

### 2.4 Financial edge cases (E) — ✅

* **Overpayment race:** `LoanRepository.findByIdAndUserIdForUpdate`
  (`PESSIMISTIC_WRITE`) now backs `recordPayment`/`deletePayment`, so the
  outstanding check + write serialize on the loan row.
* **Re-anchor race:** `AccountService.update` balance true-up re-reads the
  account under `findByIdAndUserIdForUpdate` and computes the new opening
  baseline inside the lock.
* **Net worth:** `AccountService.balanceByAccountIncludingInactive` (new
  `findAllByUserId`) — dashboard `totalBalance` now counts deactivated
  accounts, so closing an account never silently shrinks the headline.
* **Credit limits:** `@Positive` on `creditLimit` in both account request
  DTOs (negative/zero previously accepted).
* **Summary count:** `summaryTotals` third column now counts only
  INCOME+EXPENSE rows; service casts defensively via `Number`.
* **Budget totals:** `BudgetsPage` no longer sums across period types —
  per-period cards (`Weekly total (weekly)` …) replace the misleading grand
  total; identical display when one period type exists.
* **Contact summary:** cancelled loans excluded
  (`findByUserIdAndContactIdAndStatusNot`), agreeing with portfolio totals.
* Tests: `AccountServiceTest` (4 — locked re-anchor math incl. paise
  rounding, inactive inclusion, card outstanding), `ContactServiceTest` (1 —
  CANCELLED exclusion + net math), `AccountDtosValidationTest` (4),
  `LoanServicePaymentTest` +1 (locking lookup is the one in use).

### Phase 2 verification (all executed)

* Backend: `./mvnw clean test` — **BUILD SUCCESS, 52 passed / 0 failed /
  0 errors** (+6 RLS-IT skipped by env gate). New suites: IdempotencyService,
  AccountService, ContactService, AccountDtosValidation, +16 transaction
  validation/nested, +1 loan payment.
* Frontend: `npm test` — **23/23 passed** (new vitest harness, 2 files);
  `npm run build` (tsc -b + vite) — **green**; `npm run lint` — no new
  warnings (4 pre-existing only).
* PGlite (real Postgres): V4 migration **6/6 checks passed** (Phase 1's
  37/37 V1–V3 run unchanged).
* Test-driven fixes made during the phase: embeddable `equals/hashCode`,
  pre-loop `isRetryable` guard, nested-class test initialization.

### Phase 2 remaining risks

* `Idempotency-Key` replay is scoped to `POST /transactions` — loan payments
  and contributions are not yet idempotent (rare paths, same outbox flush is
  transaction-only). Candidate for Phase 3/4.
* Concurrent-same-key requests: the loser gets a generic 409 (DataIntegrity
  handler) and the client retries — safe, not elegant.
* Idempotency rows are never auto-purged (index ready; one row per created
  transaction — years of headroom). Scheduler is a Phase 3+ candidate.
* JPQL change in `summaryTotals` is syntax-checked by review only — it needs
  a booting EntityManager (integration tests/CI) to validate at runtime.
* No migration of historical behavior needed: the header is optional;
  pre-existing outbox entries already carry `clientId` and gain protection
  automatically on their next flush.

## Phase 3 — Backend reliability ⬜ | Phase 4 — Frontend reliability ⬜
## Phase 5 — UI/UX ⬜ | Phase 6 — Testing & CI ⬜ | Phase 7 — Final verification ⬜
