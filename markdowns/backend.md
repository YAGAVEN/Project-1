# Personal Finance Tracker — Backend Plan

## 1. Overview

This document defines the backend for the Personal Finance Tracker described in
`frontend.md`, using the data model from `schema.md` plus the deltas defined in
Section 7.

The backend is a Spring Boot REST API. It is the only component that talks to
the database. The frontend talks only to this API. The data model is defined in
**`schema.md` (v2)** — the single source of truth for tables, constraints, and
indexes.

### Scope of version 1

In scope:

- Email + password authentication (via Supabase Auth)
- Manual entry of transactions, accounts, categories, budgets, loans, goals
- Dashboard, drill-down, and analytics read models
- Derived balances and usage calculations

Out of scope (parked for future versions):

- Transaction inbox / SMS or app notification imports
- Voice input
- Recurring transactions
- Notifications and alerts
- Billing-cycle credit card statements
- Multi-currency support

These are parked, not deleted. Section 12 describes where they plug in later so
that nothing in v1 needs to be redesigned when they arrive.

### Decisions locked during design

| Decision | Choice |
|---|---|
| Backend stack | Spring Boot 4.x, Java 21, Maven |
| Database | Supabase (hosted PostgreSQL) |
| Authentication | Supabase Auth issues JWT; Spring validates it as an OAuth2 resource server |
| Loans | Every loan and repayment creates a real money-movement transaction |
| Transaction types | Explicit loan types (`LOAN_GIVEN`, `LOAN_RECEIVED`, `LOAN_REPAYMENT_IN`, `LOAN_REPAYMENT_OUT`) |
| Budgets | Recurring templates (set once, apply to every period) |
| Entry mode | Manual entry only in v1 |
| Data model | `schema.md` (v2) — backend owns API behavior, schema.md owns tables |

---

## 2. System Architecture

### 2.1 Runtime topology

```text
Frontend (frontend.md)         Spring Boot API                Supabase
┌──────────────────┐  HTTPS   ┌───────────────────┐  JDBC    ┌──────────────┐
│ React / JSON     │ ───────► │ Controllers        │ ───────► │ PostgreSQL   │
│ holds JWT        │  Bearer  │   → Services       │ HikariCP │ (schema.md   │
└──────────────────┘          │   → Repositories   │  pool    │  tables)     │
                              └───────────────────┘          └──────────────┘
                                      │
                                      ▼
                              Supabase Auth (JWT signing only — no data access)
```

Rules:

1. The frontend never connects to the database. Only the API does.
2. The frontend calls Supabase Auth directly for login/refresh, then sends the
   resulting access token to the API as `Authorization: Bearer <token>`.
3. The API is the security boundary. Every query is scoped to the
   authenticated `user_id` in the service layer. Row Level Security is not
   relied upon on this path.
4. All reads of "current" numbers (balances, budget usage, loan outstanding,
   goal progress) are computed from transactions — never stored and hand-edited.

### 2.2 Request lifecycle

```text
1. CORS filter                      — allow configured frontend origins only
2. JWT validation                   — signature + expiry checked by Spring Security
3. User resolution                  — sub claim → profiles row (auto-provisioned on first sight)
4. Controller                       — DTO validation (Jakarta Bean Validation)
5. Service (@Transactional)         — business rules + ownership scoping (user_id = current user)
6. Repository (Spring Data JPA)     — SQL against Supabase Postgres
7. DTO mapping → JSON response
```

### 2.3 Database connection

The API connects to Supabase Postgres over JDBC with HikariCP.

```text
JDBC URL      jdbc:postgresql://aws-0-<region>.pooler.supabase.com:5432/postgres
Username      postgres.<project-ref>
Password      (env var only, never in the repo)
SSL           required (sslmode=require)
```

Notes:

- Use the **session pooler** host (port 5432) rather than the direct
  `db.<project-ref>.supabase.com` host: the direct host is IPv6-only on new
  projects, while the pooler works from IPv4-only networks.
- The transaction pooler (port 6543) is not recommended with Hibernate prepared
  statements.
- Credentials come from environment variables or a local `.env` file that is
  git-ignored.

### 2.4 Code layering

```text
com.finance.tracker
├── config/          SecurityConfig, OpenAPI, CORS, JPA auditing, clock
├── common/          Error handling, exceptions, PageResponse, PeriodResolver
├── auth/            JWT decoder wiring, current-user resolution
├── profile/         User profile
├── account/         Accounts + balance computation
├── category/        Categories (one level of subcategories)
├── transaction/     Transaction CRUD, filters, summaries
├── budget/          Budget templates + usage engine
├── contact/         Contacts
├── loan/            Loans + repayments (orchestrates transactions)
├── goal/            Savings goals + contributions
├── dashboard/       Aggregated dashboard read model
└── analytics/       Timeseries aggregations
```

Each module contains: `controller`, `service`, `repository`, `entity`, `dto`,
`mapper`.

Dependency rules:

```text
controller   → its own service only
service      → its own repository + other modules' services when needed
dashboard    → account, transaction, budget, loan, goal   (read-only aggregator)
analytics    → transaction, account, goal                 (read-only aggregator)

No cycles. account/transaction/budget/loan/goal never depend on
dashboard or analytics.
```

---

## 3. Tech Stack and Configuration

### 3.1 Dependencies

| Dependency | Purpose |
|---|---|
| `spring-boot-starter-webmvc` | REST API (Boot 4 name for starter-web) |
| `spring-boot-starter-data-jpa` | Hibernate + Spring Data repositories |
| `spring-boot-starter-security-oauth2-resource-server` | JWT validation |
| `spring-boot-starter-validation` | Request DTO validation |
| `spring-boot-starter-actuator` | `/actuator/health` |
| `org.postgresql:postgresql` | JDBC driver |
| `spring-boot-starter-flyway` + `flyway-database-postgresql` | Schema migrations |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.0` | Swagger UI at `/swagger-ui.html` |
| Boot test starters + Testcontainers | Tests against real Postgres |

Lombok is optional; use it only if the team prefers it.

### 3.2 Environment variables

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://aws-0-<region>.pooler.supabase.com:5432/postgres
SPRING_DATASOURCE_USERNAME=postgres.<project-ref>
SPRING_DATASOURCE_PASSWORD=<db-password>
SUPABASE_PROJECT_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=<only needed if the project still uses legacy HS256 keys>
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### 3.3 Conventions

| Concern | Decision |
|---|---|
| Currency | INR only, `NUMERIC(14,2)` → `BigDecimal` in Java |
| Timezone | Asia/Kolkata. All period windows computed in IST |
| Dates | `transaction_date` is `DATE`; `created_at`/`updated_at` are `TIMESTAMPTZ` |
| IDs | UUID v4, generated server-side |
| Pagination | `?page=0&size=20`, max size 100 |
| Base path | `/api/v1` |
| Errors | RFC 7807 `application/problem+json` (Section 10) |

---

## 4. Authentication

### 4.1 Flow

```text
Frontend                          Supabase Auth              Spring Boot API
   │  POST /auth/v1/token               │                          │
   │  {email, password} ───────────────► │                          │
   │  ◄── access_token (JWT) + refresh  │                          │
   │                                     │                          │
   │  GET /api/v1/...  Authorization: Bearer <JWT> ────────────────► │
   │                                     │              verify signature/expiry
   │                                     │              sub → profiles.id
   │  ◄──────────────────────────────────────────────────  response │
```

- Login, logout, refresh, and password reset are handled entirely by
  Supabase Auth. The API never sees a password.
- `schema.md` section 4 (`auth.users`) stays exactly as written.

### 4.2 JWT validation in Spring

Configure the API as an OAuth2 resource server:

```java
http.authorizeHttpRequests(auth -> auth
        .requestMatchers("/actuator/health", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
        .anyRequest().authenticated())
    .oauth2ResourceServer(rs -> rs.jwt(jwt -> jwt.decoder(jwtDecoder())));
```

Two supported configurations:

1. **Preferred — asymmetric signing keys.** Enable JWT signing keys in the
   Supabase dashboard, then set `spring.security.oauth2.resourceserver.jwt.issuer-uri`
   to `https://<project-ref>.supabase.co/auth/v1`. Spring fetches the JWKS
   document from Supabase and validates RS256/ES256 tokens with no shared
   secret.
2. **Legacy — HS256 shared secret.** If the project still signs tokens with the
   legacy JWT secret, build a `NimbusJwtDecoder` with
   `SecretKeySpec(supabaseJwtSecret, "HS256")` from the environment variable.

### 4.3 User resolution and provisioning

- The `sub` claim is the `auth.users.id` and equals `profiles.id`.
- On the first request from a new user, the API inserts a `profiles` row
  (auto-provisioning), using `user_metadata.full_name` when present.
- Provisioning also seeds the default category set (Section 7.4) so a new user
  can record transactions immediately.
- Every repository method that reads or writes user data takes `userId` as a
  parameter, taken from the security context — never from a request body.

---

## 5. Backend Modules

| Module | Responsibility | Owns tables |
|---|---|---|
| `auth` | Token validation, current-user resolution, provisioning trigger | — |
| `profile` | Profile read/update | `profiles` |
| `account` | Account CRUD, balance computation, account detail read model | `accounts` |
| `category` | Category CRUD (max one parent level) | `categories` |
| `transaction` | Transaction CRUD, filtering, period summaries | `transactions` |
| `budget` | Budget template CRUD, usage engine | `budgets` |
| `contact` | Contact CRUD, per-contact loan summary | `contacts` |
| `loan` | Loan creation with money movement, repayments, outstanding | `loans`, `loan_payments` |
| `goal` | Goal CRUD, contributions, progress | `savings_goals`, `goal_contributions` |
| `dashboard` | One aggregated response for the Dashboard page | — |
| `analytics` | Timeseries endpoints for the Analytics page | — |

---

## 6. Core Calculation Engine

All money values are derived. Nothing in this section is stored.

### 6.1 Period resolution

A shared `PeriodResolver` converts a period selector into a half-open window
`[start, end)`:

```text
Input:   periodType ∈ {DAY, WEEK, MONTH, YEAR}  +  anchor date (ISO)
Output:  startDate, endDate  (IST)

DAY    → that calendar day
WEEK   → Monday .. Sunday containing the anchor
MONTH  → first .. last day of that month
YEAR   → Jan 1 .. Dec 31
```

Every list, chart, and summary endpoint accepts `?periodType=&date=` and
returns the resolved window in its response so the frontend can label charts.

Series granularity (frontend.md section 6):

```text
DAY  → hourly     (requires transaction_time, Section 7.2)
WEEK → daily
MONTH→ daily
YEAR → monthly
```

### 6.2 Account balance

```text
money_in(A)  = Σ amount of transactions where to_account_id   = A
money_out(A) = Σ amount of transactions where from_account_id = A

balance(A) = opening_balance + money_in(A) − money_out(A)
```

Which transaction types flow which way:

| Type | from_account | to_account |
|---|---|---|
| INCOME | — | + |
| EXPENSE | − | — |
| TRANSFER | − | + |
| LOAN_GIVEN | − | — |
| LOAN_RECEIVED | — | + |
| LOAN_REPAYMENT_IN | — | + |
| LOAN_REPAYMENT_OUT | − | — |

This single rule covers bank accounts, cash wallets, investment accounts, and
credit cards without special cases.

### 6.3 Income, expense, and cash flow

```text
Income      = Σ amount WHERE transaction_type = INCOME   AND date in window
Expense     = Σ amount WHERE transaction_type = EXPENSE  AND date in window
Net cash    = Income − Expense
```

`TRANSFER` and all `LOAN_*` types never appear in these totals. Lending money
is not spending; borrowing money is not earning.

### 6.4 Credit card metrics

For an account with `account_type = CREDIT_CARD`:

```text
outstanding      = −balance                      (balance is negative or zero)
monthSpend       = Σ EXPENSE where from_account = card, in current month
availableCredit  = credit_limit − outstanding
utilization      = outstanding / credit_limit × 100
```

A card purchase is an `EXPENSE` from the card. Paying the bill is a `TRANSFER`
bank → card, which changes no income/expense total.

### 6.5 Budget usage

For a template `(category, periodType, amountLimit)` viewed at anchor date:

```text
window  = PeriodResolver(periodType, anchorDate)
used    = Σ EXPENSE where category = template.category AND date in window
remaining = amountLimit − used
percentageUsed = used / amountLimit × 100

status  = OK       if percentageUsed < 80
        = WARNING  if 80 ≤ percentageUsed ≤ 100
        = OVER     if percentageUsed > 100
```

### 6.6 Loan outstanding

```text
outstanding = original_amount − Σ loan_payments.amount
status      = PAID    when outstanding = 0   (auto-set by the service)
            = ACTIVE  otherwise
```

Portfolio totals for dashboard/contacts:

```text
totalReceivable = Σ outstanding of ACTIVE loans where loan_type = LENT
totalPayable    = Σ outstanding of ACTIVE loans where loan_type = BORROWED
```

### 6.7 Goal progress

```text
progress   = Σ goal_contributions.amount for the goal
percentage = progress / target_amount × 100
status     = COMPLETED when progress ≥ target_amount   (auto-set by the service)
```

### 6.8 Net position and the Savings page

```text
netPosition = Σ balance over all active accounts
            (credit cards contribute negative balances automatically)

Liquid cash      = Σ balance of BANK + CASH accounts
Investments      = Σ balance of INVESTMENT accounts
Goals allocation = Σ contributions toward ACTIVE goals
```

Note for the frontend: goals allocation is a **virtual label** on the same
money — it is not additional money and must not be added to liquid cash.

Loan receivables/payables are not part of net position; they are displayed
separately as "You'll get ₹X" / "You owe ₹Y".

---

## 7. Data Model

The single source of truth for tables, columns, constraints, indexes, and the
deletion policy is **`schema.md` (v2)**. It defines the seven transaction
types, `loans.transaction_id` (every loan is backed by real money movement),
recurring budget templates, optional `transaction_time`, default category
seeding, and per-entity deletion rules.

Backend-owned rules layered on top of that model:

| Rule | Detail |
|---|---|
| Loan movements only via loan API | `LOAN_*` transactions are created exclusively by the loan endpoints (Section 8.7); the generic transaction API accepts only `INCOME`, `EXPENSE`, `TRANSFER` |
| Type immutability | `transaction_type` never changes on update — a wrong type is deleted and re-created |
| Loan amount immutability | `loans.original_amount` never changes; fix mistakes by deleting the loan (only while it has no payments) and recreating it |
| Default categories | Seeded by profile provisioning on the user's first authenticated request (schema.md §7.4) |
| Migrations | Flyway `V1__init.sql` reproduces schema.md v2 exactly; later changes only ever arrive as new migrations |

---

## 8. REST API Specification

### 8.1 Conventions

- Base path `/api/v1`, JSON bodies, UTC ISO dates (`yyyy-MM-dd`) in requests.
- All endpoints require a valid JWT except the ones exempted in Section 4.2.
- Lists are paginated: `{ "content": [...], "page": 0, "size": 20, "totalElements": 143 }`.
- Errors use RFC 7807 (Section 10).

### 8.2 Profile

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Current profile (auto-provisions on first call) |
| PUT | `/me` | Update `full_name`, `preferred_currency` |

### 8.3 Accounts

| Method | Path | Purpose |
|---|---|---|
| GET | `/accounts` | List active accounts with computed balances |
| POST | `/accounts` | Create account (`name`, `accountType`, `openingBalance`, credit fields if card) |
| GET | `/accounts/{id}?periodType&date` | Detail: balance, card metrics, money in/out for window, balance trend, recent transactions |
| PUT | `/accounts/{id}` | Update name/limits/active |
| DELETE | `/accounts/{id}` | Per deletion policy (Section 7.7) |

Balance trend = closing balance at the end of each bucket in the window
(monthly buckets for YEAR, daily otherwise).

### 8.4 Categories

| Method | Path | Purpose |
|---|---|---|
| GET | `/categories?type=EXPENSE` | List (active by default, `includeInactive=true` optional) |
| POST | `/categories` | Create (`name`, `categoryType`, optional `parentCategoryId`) |
| PUT | `/categories/{id}` | Rename / deactivate |
| DELETE | `/categories/{id}` | Per deletion policy |

Enforced: one parent level only (a subcategory cannot have a subcategory).

### 8.5 Transactions

| Method | Path | Purpose |
|---|---|---|
| GET | `/transactions` | Filters: `type`, `categoryId`, `accountId`, `from`, `to`, `q` (description ilike), `page`, `size`. Sorted `transaction_date DESC` |
| POST | `/transactions` | Create `INCOME` / `EXPENSE` / `TRANSFER` only |
| GET | `/transactions/{id}` | Detail |
| PUT | `/transactions/{id}` | Edit fields; type immutable |
| DELETE | `/transactions/{id}` | Delete |
| GET | `/transactions/summary?periodType&date` | `{ income, expense, netCashFlow, count }` for the window |

Create request (expense example):

```json
POST /api/v1/transactions
{
  "transactionType": "EXPENSE",
  "amount": 500.00,
  "fromAccountId": "7c9e…",
  "toAccountId": null,
  "categoryId": "1a2b…",
  "description": "Lunch - Swiggy",
  "transactionDate": "2026-09-03",
  "transactionTime": "13:30"
}
```

Response returns the created transaction plus the recomputed `fromAccountBalance`
/ `toAccountBalance`, so the frontend can update the UI without a refetch.

### 8.6 Budgets

| Method | Path | Purpose |
|---|---|---|
| GET | `/budgets?date=2026-09-15` | All active templates with usage computed for the period containing `date`, plus totals (`totalBudget`, `totalSpent`, `totalRemaining`) |
| POST | `/budgets` | Create template (`categoryId`, `amountLimit`, `periodType`) |
| PUT | `/budgets/{id}` | Update limit / period / active |
| DELETE | `/budgets/{id}` | Delete template |
| GET | `/budgets/{id}/transactions?date=2026-09-15` | Contributing transactions for that period (budget drill-down) |
| GET | `/budgets/{id}/history?periods=6` | Usage per past period (budget trend) |

Response item shape:

```json
{
  "budgetId": "…",
  "categoryId": "…",
  "categoryName": "Food",
  "periodType": "MONTHLY",
  "amountLimit": 10000.00,
  "used": 7200.00,
  "remaining": 2800.00,
  "percentageUsed": 72.0,
  "status": "OK",
  "window": { "startDate": "2026-09-01", "endDate": "2026-09-30" }
}
```

### 8.7 Contacts and Loans

| Method | Path | Purpose |
|---|---|---|
| GET / POST / PUT / DELETE | `/contacts` | Contact CRUD |
| GET | `/contacts/{id}` | Summary: `totalLent`, `totalReturned`, `totalBorrowed`, `totalRepaid`, `netPending` |
| GET | `/loans?direction=LENT&status=ACTIVE` | List with contact name and outstanding |
| POST | `/loans` | Create loan **with** money movement (transactional) |
| GET | `/loans/{id}` | Detail: original, outstanding, payment timeline |
| PUT | `/loans/{id}` | Edit description/contact only. `amount` is immutable (delete + recreate instead) |
| DELETE | `/loans/{id}` | Per deletion policy |
| POST | `/loans/{id}/payments` | Record repayment (creates transaction + payment, transactional) |
| DELETE | `/loans/{id}/payments/{paymentId}` | Remove a mistaken payment + its transaction |

Loan creation:

```json
POST /api/v1/loans
{
  "contactId": "…",
  "loanType": "LENT",
  "amount": 5000.00,
  "loanDate": "2026-09-03",
  "accountId": "…",
  "description": "Movie tickets"
}
```

```text
LENT     → creates LOAN_GIVEN         transaction, from  = accountId
BORROWED → creates LOAN_RECEIVED      transaction, to    = accountId
```

Repayment:

```json
POST /api/v1/loans/{id}/payments
{ "amount": 2000.00, "paymentDate": "2026-09-20", "accountId": "…" }
```

```text
LENT loan     → LOAN_REPAYMENT_IN  into accountId
BORROWED loan → LOAN_REPAYMENT_OUT from accountId
```

When `outstanding` reaches 0 the loan status flips to `PAID` automatically.

### 8.8 Goals

| Method | Path | Purpose |
|---|---|---|
| GET | `/goals?status=ACTIVE` | List with progress |
| POST | `/goals` | Create (`name`, `targetAmount`, optional `targetDate`) |
| GET | `/goals/{id}` | Detail: contributions list, progress-over-time series |
| PUT | `/goals/{id}` | Update / cancel |
| DELETE | `/goals/{id}` | Per deletion policy |
| POST | `/goals/{id}/contributions` | `{ amount, contributionDate, notes?, transactionId? }` — allocation only; if money actually moved (e.g. bank → investment), the frontend also creates a TRANSFER and passes its id |
| DELETE | `/goals/{id}/contributions/{cid}` | Remove contribution |

### 8.9 Dashboard (single aggregated endpoint)

```text
GET /api/v1/dashboard?periodType=MONTH&date=2026-09-03
```

Returns everything the Dashboard page renders in one call:

```json
{
  "period": { "periodType": "MONTH", "startDate": "2026-09-01", "endDate": "2026-09-30" },
  "totals": {
    "totalBalance": 86500.00,
    "income": 50000.00,
    "expense": 32400.00,
    "netCashFlow": 17600.00
  },
  "incomeExpenseSeries": [
    { "bucket": "2026-09-01", "income": 0.00,     "expense": 450.00 },
    { "bucket": "2026-09-02", "income": 50000.00, "expense": 200.00 }
  ],
  "expenseByCategory": [
    { "categoryId": "…", "name": "Food",   "amount": 7200.00, "percentage": 22.2 }
  ],
  "budgets": [
    { "budgetId": "…", "categoryName": "Food", "amountLimit": 10000.00,
      "used": 7200.00, "remaining": 2800.00, "percentageUsed": 72.0, "status": "OK" }
  ],
  "accountBalances": [
    { "accountId": "…", "name": "HDFC Bank", "accountType": "BANK", "balance": 45000.00 },
    { "accountId": "…", "name": "HDFC Card", "accountType": "CREDIT_CARD", "balance": -3000.00 }
  ],
  "creditCards": [
    { "accountId": "…", "outstanding": 3000.00, "availableCredit": 97000.00, "monthSpend": 1500.00 }
  ],
  "loansSummary": { "totalReceivable": 4000.00, "totalPayable": 10000.00 },
  "recentTransactions": [ { "id": "…", "description": "Lunch - Swiggy", "categoryName": "Food",
                            "accountName": "HDFC Bank", "transactionDate": "2026-09-03",
                            "amount": 450.00, "transactionType": "EXPENSE" } ]
}
```

`recentTransactions` is limited to 10.

### 8.10 Analytics

All endpoints accept `?periodType=&date=` and return `period` plus a series.

| Method | Path | Returns |
|---|---|---|
| GET | `/analytics/income-expense` | Income and expense per bucket |
| GET | `/analytics/spending-trend` | Expense per bucket (line chart) |
| GET | `/analytics/expense-categories` | Expense per category, sorted desc, with percentages (serves both the donut and the comparison bar) |
| GET | `/analytics/savings-progress` | Cumulative goal contributions per bucket (`?goalId=` to focus one goal) |
| GET | `/analytics/account-cashflow` | Per account: `moneyIn`, `moneyOut` for the window |

---

## 9. Business Rules and Validation Matrix

### 9.1 Per-type validation (service layer)

| Type | from_account | to_account | category | Extra |
|---|---|---|---|---|
| INCOME | must be null | required, not a credit card | required, type INCOME | |
| EXPENSE | required (card allowed) | must be null | required, type EXPENSE | |
| TRANSFER | required | required, ≠ from | must be null | |
| LOAN_GIVEN | required, not a credit card | must be null | must be null | loan API only |
| LOAN_RECEIVED | must be null | required, not a credit card | must be null | loan API only |
| LOAN_REPAYMENT_IN | must be null | required, not a credit card | must be null | loan payment API only |
| LOAN_REPAYMENT_OUT | required, not a credit card | must be null | must be null | loan payment API only |

Rationale for "not a credit card": lending from a card is a cash advance, and
money entering a card is a bill payment (already modeled as TRANSFER). Both are
out of v1 scope.

All accounts and categories referenced must belong to the current user and be
active. All amounts must be positive.

### 9.2 Invariants carried over from schema.md

1. Transfers never affect income, expense, or budgets.
2. A credit card purchase is an expense; the bill payment is a transfer.
3. Money lent is not an expense; money borrowed is not income.
4. Balances, budget usage, loan outstanding, and goal progress are always
   derived, never stored.
5. Every write path scopes by the authenticated `user_id`.

### 9.3 Atomic write paths

These operations write to more than one table and must run in one
`@Transactional` service method:

```text
Create loan        → transactions + loans
Delete loan        → transactions + loans        (only while unpaid)
Create repayment   → transactions + loan_payments + loans.status
Delete repayment   → transactions + loan_payments + loans.status
Create transaction → transactions + balance recompute for response
```

---

## 10. Error Handling

RFC 7807 responses produced by a single `@RestControllerAdvice`:

| Status | When |
|---|---|
| 400 | Bean Validation failure, malformed period, bad UUID |
| 401 | Missing/expired/invalid JWT |
| 403 | Access to another user's resource (treated as 404 for IDs that exist but are not owned — do not leak existence) |
| 404 | Resource not found for this user |
| 409 | Business conflict: duplicate budget template, transfer to same account, deleting a referenced contact/loan, editing a loan amount, INCOME into a credit card |
| 500 | Unhandled — logged with a correlation id, generic message returned |

Error body shape:

```json
{
  "type": "https://finance-tracker/errors/business-rule",
  "title": "Duplicate budget template",
  "status": 409,
  "detail": "An active MONTHLY budget already exists for category Food",
  "instance": "/api/v1/budgets"
}
```

---

## 11. Non-Functional Notes

- **Migrations:** Flyway `V1__init.sql` creates the full schema per
  `schema.md` (v2). Schema changes only ever arrive as new migrations.
- **Auditing:** `created_at` / `updated_at` via JPA auditing — no DB triggers
  needed on this path.
- **Auditing of edits:** none in v1 (agreed). `updated_at` is the only trace.
- **OpenAPI:** springdoc generates the contract consumed by the frontend;
  group by module.
- **Health:** `/actuator/health` (public) for local sanity checks.
- **Testing priority:** the calculation engine (Section 6) and the loan
  atomicity paths (Section 9.3) get unit + Testcontainers integration tests
  first — everything in the UI depends on them being exactly right.
- **Seed script:** a `dev` profile seeder that creates two accounts, one card,
  categories, a few transactions across two months, one budget, one loan pair,
  and one goal — so the dashboard has something to render on day one.

---

## 12. Future Extensions (parked, not designed)

Where the parked features plug in when revived:

| Feature | Plug-in point |
|---|---|
| Transaction inbox | New `pending_transactions` table + `inbox` module. `POST /inbox` accepts raw notification text, stores a parsed candidate, status `PENDING → CONFIRMED/IGNORED/DUPLICATE`. Confirming creates a normal transaction via the existing `transaction` service. Nothing in v1 changes. |
| Voice input | Same inbox, `source = VOICE`. Audio → transcription → extraction → PENDING entry → user confirms. |
| Imports (SMS/webhook) | Same inbox, `source = IMPORT`, plus a dedup fingerprint (amount + merchant + time window). |
| Recurring transactions | A `recurring_rules` table + a scheduler that mints confirmed transactions. |
| Billing-cycle statements | Derivable later from existing data using `billing_day`; no schema change required for history. |

The v1 model was deliberately shaped so none of these require changing
`transactions`, `accounts`, or the calculation engine.

---

## 13. Build Order

| Milestone | Delivers |
|---|---|
| M0 | Project scaffold, Flyway V1, security (JWT validation + profile provisioning), health, Swagger |
| M1 | Profile, accounts (with balances), categories (+ default seed) |
| M2 | Transactions CRUD, validation matrix, summaries |
| M3 | Budget templates + usage engine, aggregated dashboard |
| M4 | Contacts, loans + repayments (atomic paths) |
| M5 | Goals + contributions |
| M6 | Analytics endpoints |
| M7 | Error handling polish, indexes verified, dev seed script, integration tests |

M0–M3 make the Dashboard and Transactions pages fully functional; M4–M5 unlock
the Loans and Savings pages; M6 completes Analytics.
