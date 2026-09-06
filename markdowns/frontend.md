# Finance / Expense Tracker — Frontend Specification (v2)

> **v2.** Aligned with `schema.md` (v2) and `backend.md`. Every page now maps
> to concrete API endpoints. `plan.md` is the project index.

## 1. Product Goal

The app should let the user open it and immediately understand:

- Where their money is.
- Where their money went.
- How much they earned.
- How much they spent.
- How their budgets are performing.
- What needs attention.

The UI should prioritize **clarity, quick navigation, and drill-down exploration**.

## Scope note (v1)

Manual entry only. There is **no** inbox page and **no** voice capture in v1 —
those features are parked (see `backend.md` §12). Add Transaction is the only
entry path, plus loan/goal flows on their own pages.

---

## 2. Main Pages

1. Dashboard
2. Transactions
3. Accounts
4. Budgets
5. Savings & Goals
6. Loans
7. Analytics
8. Settings

A separate **Login** page is shown before entering the application.

### Navigation Tree

```text
Login
  |
  +--> Dashboard
  |      +--> Transactions
  |      +--> Accounts
  |      +--> Budgets
  |      +--> Savings & Goals
  |      +--> Loans
  |      +--> Analytics
  |      +--> Settings
  |
  +--> Logout
```

---

# 3. Global Application Layout

Use a persistent **left sidebar**:

```text
+-------------------------+
| Finance Tracker         |
|                         |
|  Dashboard              |
|  Transactions           |
|  Accounts               |
|  Budgets                |
|  Savings                |
|  Loans                  |
|  Analytics              |
|  Settings               |
|                         |
|  [+ Add Transaction]    |
+-------------------------+
```

The **Add Transaction** action is prominent and always accessible. Loan and
goal flows are created from their own pages, not this button.

---

# 4. Login Page

Rebuilt Groww-style on 2026-09-05 (split layout, brand green). Routes: `/login`
(all pre-auth paths redirect here) and `/reset-password`.

- **Layout** — form column left (logo, heading, form); decorative brand panel
  right (Groww-green `#00b386`, mock dashboard cards), hidden below `lg`.
- **Views** on one page: sign-in · sign-up (2026-09-04 toggle) · forgot-password
  · "check your inbox" sent-state.
- Brand green lives in `index.css` `@theme` (`--color-brand-*`); the primary
  button, input focus ring, and sidebar active pill all share it. Groww-green
  CTA + white text is ~2.7:1 contrast — kept on the large CTA for brand
  fidelity; small green text uses `brand-700` (AA-passing). Theming rules for
  this page (brand panel, sparkline, toggle) are in §25.
- UX rules: inline field validation before network calls, show/hide password,
  visible labels + `autoComplete`, spinner/disabled while submitting,
  plain-language mapping of Supabase errors (`lib/authErrors.ts`).

### Forgot-password flow (Supabase Auth only — no backend change)

```text
/reset-password?code=…  →  supabase-js exchanges the code (PKCE)  →  recovery session
```

1. Forgot view → `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
   Supabase returns 200 even for unknown emails, so no account-existence leak.
2. Email link lands on `/reset-password` — this route is matched BEFORE the
   session gate in `App.tsx`, because the recovery exchange creates a session.
   Recovery is detected by pathname, NOT the `PASSWORD_RECOVERY` event (with
   PKCE it fires unreliably; often only `SIGNED_IN`).
3. ResetPasswordPage phases: verifying → form (new + confirm password) →
   `updateUser({ password })` → done → dashboard. Expired/used links get a
   "request a new link" path back to `/login` (state `{ view: 'forgot' }`).
4. **Supabase dashboard prerequisite:** Auth → URL Configuration → Redirect
   URLs must include `http://localhost:5173/reset-password` (and the prod URL).

### Auth contract

```text
Login          → supabase.auth.signInWithPassword({ email, password })
Sign-up        → supabase.auth.signUp({ email, password })
Forgot         → supabase.auth.resetPasswordForEmail(email, { redirectTo })
Set password   → supabase.auth.updateUser({ password })   (on recovery session)
Token          → access_token kept by the client, refreshed by supabase-js
API calls      → Authorization: Bearer <access_token> on every request
After login    → Dashboard
```

The frontend never talks to the database directly — only to Supabase Auth and
the Spring Boot API.

---

# 5. Dashboard

The Dashboard answers five questions immediately:

1. How much money do I currently have?
2. How much did I earn?
3. How much did I spend?
4. How are my budgets performing?
5. Is there anything that needs my attention?

## API contract

```text
GET /api/v1/dashboard?periodType=MONTH&date=2026-09-03
```

One call returns everything on this page: `totals`, `incomeExpenseSeries`,
`expenseByCategory`, `budgets`, `accountBalances`, `creditCards`,
`loansSummary`, `recentTransactions`, and the resolved `period` window.

## Dashboard Layout

```text
+-------------------------------------------------------------+
| Dashboard                         [Period Selector]         |
+-------------------------------------------------------------+
| Total Balance | Income | Expenses | Net Cash Flow          |
+-------------------------------------------------------------+
| Needs attention: over-budgets · card outstanding · loans    |
+-------------------------------------------------------------+
|                                                             |
| Income vs Expense                                           |
| [Bar Chart]                                                 |
|                                                             |
+-----------------------------+-------------------------------+
| Expense Breakdown           | Budget Overview               |
| [Donut Chart]               | [Progress Bars]              |
+-----------------------------+-------------------------------+
|                                                             |
| Account Balances                                            |
| [Horizontal Bars / Cards]                                  |
+-------------------------------------------------------------+
| Recent Transactions                                         |
| [Transaction List]                                          |
+-------------------------------------------------------------+
```

## Stat Cards

| Card | Source field | Meaning |
|---|---|---|
| Total Balance | `totals.totalBalance` | Net money across all accounts (cards count negative) |
| Income | `totals.income` | Income during selected period |
| Expenses | `totals.expense` | Expenses during selected period |
| Net Cash Flow | `totals.netCashFlow` | Income minus expenses |

## Needs-Attention Strip

Derived from the same response:

- Budgets with `status = WARNING` or `OVER`.
- Credit cards with `outstanding > 0` (show `availableCredit`).
- `loansSummary.totalReceivable` / `totalPayable` — link to the Loans page.

---

# 6. Global Period Selector

Reusable across Dashboard and Analytics.

```text
[ Day ] [ Week ] [ Month ] [ Year ]

        <  September 2026  >
```

### API contract

Every consuming request sends:

```text
?periodType=DAY|WEEK|MONTH|YEAR&date=<anchor date, ISO>
```

Responses include the resolved window (`period.startDate` / `period.endDate`)
so labels can be rendered from the server's definition (WEEK = Mon–Sun, IST).

### Chart Granularity

| Period | Chart Granularity |
|---|---|
| Day | Hourly (from `transaction_time`; entries without it bucket at 00:00) |
| Week | Daily |
| Month | Daily or Weekly |
| Year | Monthly |

Changing the period updates all connected charts.

---

# 7. Income vs Expense Chart

Source: `dashboard.incomeExpenseSeries` (or `/analytics/income-expense`).

### UI

```text
Income vs Expense

[ Income ✓ ] [ Expense ✓ ]

        █
    █   █       █
    █   █   █   █
────┴───┴───┴───┴────
```

### Requirements

- Bar chart for monthly/longer period views.
- Income and Expense series toggleable.
- X-axis matches the selected granularity (Section 6).
- Hover shows exact amounts.
- **Loan and transfer movements never appear here** — they are not income and
  not expense by design.

---

# 8. Expense by Category

Source: `dashboard.expenseByCategory` (donut), with `name`, `amount`,
`percentage`.

Example categories: Food, Transport, Shopping, Bills, Entertainment,
Healthcare, Other.

### Drill Down

Clicking a slice navigates to Transactions with:

```text
Category = Selected Category
Period   = Selected Period
Type     = Expense
```

---

# 9. Budget Overview

Progress bars, not a chart. Source: `dashboard.budgets[]`.

```text
Food
██████████████░░░░  72%
₹7,200 / ₹10,000

Transport
██████████████████  90%
₹4,500 / ₹5,000

Shopping
████████████████████  105%  OVER BUDGET
₹10,500 / ₹10,000
```

### Status mapping (from the API)

| `status` | Meaning | UI treatment |
|---|---|---|
| `OK` | < 80% used | Normal |
| `WARNING` | 80–100% used | Amber |
| `OVER` | > 100% used | Red, "OVER BUDGET" label |

Clicking a budget opens its detail view (Section 15).

---

# 10. Account Balances

Source: `dashboard.accountBalances[]` — `balance` is already correct per
account (credit cards negative).

### 2–3 Accounts → cards

```text
+------------------+
| HDFC Bank        |
| ₹45,000           |
+------------------+

+------------------+
| Cash             |
| ₹8,500            |
+------------------+
```

### Many Accounts → horizontal bars

```text
Bank       ███████████████████ ₹45,000
Savings    █████████████        ₹30,000
Cash       █████                ₹8,500
Card       ███ (−)              −₹3,000
```

---

# 11. Recent Transactions

Source: `dashboard.recentTransactions[]` (limit 10).

Each row shows: description, category, account, date, amount, and an
income/expense indicator. Loan movements render with a **Loan** badge and link
to the loan detail.

Clicking a transaction opens the details drawer/modal.

---

# 12. Transactions Page

Full transaction management.

## API contract

```text
GET /api/v1/transactions
    ?type=&categoryId=&accountId=&from=&to=&q=&page=&size=
GET /api/v1/transactions/summary?periodType=&date=
POST/PUT/DELETE /api/v1/transactions...
```

The list is flat and paginated; group it by date client-side.

## Controls

```text
Search transactions...            → q

Type       [All | Income | Expense | Transfer]
Category   [All v]
Account    [All v]
Date       [Select Date]

                         [+ Add Transaction]
```

## Transaction List

```text
Today
------------------------------------------------
Food              HDFC Bank        -₹450
Salary            HDFC Bank       +₹50,000
Loan · Arun repaid  HDFC Bank      +₹1,000   [Loan badge]

Yesterday
------------------------------------------------
Transport         Cash             -₹200
Shopping          HDFC Card        -₹1,500
HDFC → SBI        Transfer         -₹10,000  [Transfer badge]
```

All seven transaction types appear in the ledger, because they all move money.
Income/expense indicators apply only to INCOME/EXPENSE; transfers and loan
movements are visually distinct and never affect the income/expense totals.

## Transaction Drawer/Modal

No separate details page. The drawer supports view / edit / delete, with rules:

| Transaction type | Editable here? |
|---|---|
| INCOME / EXPENSE / TRANSFER | Yes — fields editable, `type` itself is immutable |
| LOAN_* | No — read-only here, with a "Manage in Loans" link |

---

# 13. Add Transaction

Opens as a modal or right-side drawer. Three types only — loan movements are
created from the Loans page.

```text
[ Expense ] [ Income ] [ Transfer ]
```

The form changes with the selected type. Validation rules below are enforced
by the backend (400/409) — mirror them client-side for fast feedback.

### Expense

```text
Amount          required, > 0
From Account    any active account (credit card allowed)
Category        EXPENSE categories only
Description     optional
Date            defaults to today (IST); optional time for the Day view
```

### Income

```text
Amount          required, > 0
To Account      BANK / CASH / INVESTMENT only — credit cards are rejected
                (money entering a card is a bill payment → use Transfer)
Category        INCOME categories only
Description     optional
Date
```

### Transfer

```text
Amount          required, > 0
From Account    required
To Account      required, must differ from From
Date
```

No category field on transfers — transfers are not spending.

Response includes recomputed account balances; update the UI from it without a
refetch.

---

# 14. Accounts Page

## API contract

```text
GET   /api/v1/accounts              (list with computed balances)
POST  /api/v1/accounts
GET   /api/v1/accounts/{id}?periodType=&date=
PUT/DELETE /api/v1/accounts/{id}
```

## Overview

```text
Accounts

Total Net Position: ₹86,500        (Σ balances; card shows negative)

[+ Add Account]

HDFC Bank             ₹45,000
Savings Account       ₹30,000
Cash                   ₹8,500
HDFC Credit Card      -₹3,000
```

## Account Details

Selecting an account opens its detailed view:

- Current balance.
- For credit cards: outstanding (`−balance`), available credit, this month's
  spend, utilization.
- Balance trend line chart (from the detail endpoint's `trend` buckets).
- Money in / money out for the selected period.
- Recent transactions for the account.

## Add/Edit Account

```text
Name            required
Type            BANK | CASH | CREDIT_CARD | INVESTMENT
Opening Balance required (0 allowed)
Credit limit / billing day / due day     CREDIT_CARD only
```

Delete follows the backend policy: accounts with history are deactivated, not
deleted — show inactive accounts greyed out with an "Inactive" tag.

---

# 15. Budgets Page

## API contract

```text
GET    /api/v1/budgets?date=2026-09-15       (templates + usage for that month)
POST   /api/v1/budgets
PUT    /api/v1/budgets/{id}
DELETE /api/v1/budgets/{id}
GET    /api/v1/budgets/{id}/transactions?date=...
GET    /api/v1/budgets/{id}/history?periods=6
```

## Mental model (important)

A budget is a **recurring template**, not a monthly entry. Creating
"Food = ₹10,000, MONTHLY" once makes every month show a Food budget. The month
navigation just changes the `?date=` query parameter.

## Overview

```text
< August 2026     September 2026     October 2026 >

September 2026

Total Budget: ₹50,000
Total Spent:  ₹32,400
Total Remaining: ₹17,600

Food
██████████████░░░░ 72%      (status colors per Section 9)

Transport
██████████████████ 90%

Shopping
████████████████████ 105%  OVER BUDGET
```

## Create/Edit Budget

```text
Category     EXPENSE categories only; one active template per category
Limit        required, > 0
Period       WEEKLY | MONTHLY | YEARLY (MONTHLY is the default use case)
```

A duplicate active template returns **409** — surface it as "X already has a
monthly budget".

## Budget Details

- Limit, spent, remaining, status.
- Daily/monthly spending trend (`/history`).
- Contributing transactions (`/transactions`) — the drill-down target from the
  dashboard progress bars.

---

# 16. Savings & Goals

## API contract

```text
GET  /api/v1/accounts                (for the savings overview)
GET  /api/v1/goals?status=ACTIVE
POST /api/v1/goals, PUT/DELETE /api/v1/goals/{id}
POST /api/v1/goals/{id}/contributions
GET  /api/v1/goals/{id}              (detail + progress-over-time series)
```

## Savings Overview

Computed from account balances:

```text
Liquid cash      = Σ balances of BANK + CASH accounts
Investments      = Σ balances of INVESTMENT accounts
Goals allocation = Σ contributions toward ACTIVE goals
```

An optional stacked bar or donut shows the split.

> **Rendering rule:** goals allocation is a virtual label on the same money —
> never display "Liquid + Investments + Goals allocation" as a total. Net
> position is `Σ all account balances` and comes from the API.

## Goals List

```text
Emergency Fund
₹60,000 / ₹1,00,000
████████████░░░░░░ 60%
Target: December 2026
```

Each goal shows name, current amount, target amount, progress percentage,
target date, progress bar.

## Goal Details

- Target, current, target date.
- Contribution history.
- **Add Contribution** action (below).
- Progress-over-time line chart.

## Add Contribution Modal

```text
Amount             required, > 0
Date               required
Notes              optional
Money actually moved?   [ ] yes — also record a Transfer
```

Checking "money actually moved" additionally creates a TRANSFER (e.g., HDFC →
investment account) and links it to the contribution. Unchecked = pure
allocation, no money movement, no effect on any account.

---

# 17. Loans Page

## API contract

```text
GET  /api/v1/loans?direction=LENT|BORROWED&status=
POST /api/v1/loans
GET  /api/v1/loans/{id}
POST /api/v1/loans/{id}/payments
DELETE /api/v1/loans/{id}/payments/{paymentId}
GET  /api/v1/contacts, POST /api/v1/contacts, GET /api/v1/contacts/{id}
```

## Tabs

```text
[ Money I Lent ]  [ Money I Borrowed ]
   direction=LENT    direction=BORROWED
```

## Money I Lent

- Amount given, amount returned, pending amount per loan.
- Header: `loansSummary.totalReceivable` — "You'll get ₹X".

## Money I Borrowed

- Amount borrowed, amount repaid, remaining per loan.
- Header: `loansSummary.totalPayable` — "You owe ₹Y".

## Record Loan Modal

```text
Direction       LENT (I gave) | BORROWED (I received)
Contact         existing contact or create inline
Amount          required, > 0, immutable afterwards
Date            loan date
Account         where the money moved:
                LENT     → money left this account
                BORROWED → money entered this account
Description     optional
```

Creating a loan automatically records the matching money movement
(`LOAN_GIVEN` / `LOAN_RECEIVED`) — the user must **not** also create a manual
expense/income for it.

## Loan Details — Timeline

```text
Loan: Arun

₹5,000 Original
     |
     +-- ₹2,000 Paid   12 Sep 2026
     |
     +-- ₹1,000 Paid   28 Sep 2026
     |
     +-- ₹2,000 Remaining
```

- Original amount, outstanding, payment history as a timeline.
- **Add Payment** action: `{ amount, date, account }` — the API records the
  matching repayment transaction. When outstanding reaches 0 the loan shows as
  **Settled**.
- Deleting a payment (mistakes) removes its transaction too.

## Contact Summary

`GET /contacts/{id}` powers a per-person view: `totalLent`, `totalReturned`,
`totalBorrowed`, `totalRepaid`, `netPending`.

---

# 18. Analytics Page

## API contract

| Chart | Endpoint |
|---|---|
| Income vs Expense | `GET /analytics/income-expense?periodType=&date=` |
| Spending Trend | `GET /analytics/spending-trend?periodType=&date=` |
| Expense Categories (donut) | `GET /analytics/expense-categories?periodType=&date=` |
| Category Comparison (bar) | same response as above, sorted, rendered as bars |
| Savings Progress | `GET /analytics/savings-progress?periodType=&date=` |
| Account Cash Flow | `GET /analytics/account-cashflow?periodType=&date=` |

Use the same reusable period selector (Section 6). All responses include the
resolved `period` window and per-bucket series.

---

# 19. Final Chart Inventory

## Dashboard

| Component | Visualization | Source |
|---|---|---|
| Total Balance | Stat Card | `totals.totalBalance` |
| Income | Stat Card | `totals.income` |
| Expense | Stat Card | `totals.expense` |
| Net Cash Flow | Stat Card | `totals.netCashFlow` |
| Income vs Expense | Bar Chart | `incomeExpenseSeries` |
| Expense by Category | Donut Chart | `expenseByCategory` |
| Budget Usage | Progress Bars | `budgets` |
| Account Balances | Cards / Horizontal Bars | `accountBalances` |
| Needs Attention | Strip | `budgets` + `creditCards` + `loansSummary` |
| Recent Transactions | List | `recentTransactions` |

## Analytics

| Component | Visualization |
|---|---|
| Income vs Expense | Bar Chart |
| Spending Trend | Line Chart |
| Category Spending | Donut Chart |
| Category Comparison | Bar Chart |
| Savings Progress | Line Chart |
| Account Cash Flow | Bar Chart |

---

# 20. Shared Chart State

```text
<PeriodSelector />   →   { periodType, date }
```

```text
                 +----------------+
                 | PeriodSelector |
                 +--------+-------+
                          |
              +-----------+-----------+
              |           |           |
              v           v           v
         Income/Expense  Spending   Categories
             Chart        Trend        Chart
```

When the period changes, every connected chart refetches with the new query
params.

---

# 21. Navigation and Drill-Down Architecture

```text
Overview
   |
   v
Identify Something Interesting
   |
   v
Click / Drill Down
   |
   v
Detailed Page
   |
   v
Filtered Transactions / Details
```

### Example

```text
Dashboard → Expense by Category → Food
    → Transactions page with Category=Food, Period=September 2026, Type=Expense
```

Other drilled paths:

- Budget progress bar → Budget detail → its transactions.
- Loans summary chip → Loans page (correct tab preselected).
- Account card → Account detail.

---

# 22. Settings Page

| Section | Endpoints | Notes |
|---|---|---|
| Profile | `GET/PUT /me` | Display name (currency is fixed to INR in v1) |
| Accounts | accounts endpoints | Create, edit, deactivate/reactivate |
| Categories | categories endpoints | Create, rename, deactivate; one parent level |
| Contacts | contacts endpoints | Create, rename, delete (blocked if loans exist → 409) |

---

# 23. Recommended Build Order

Implement the frontend in this order (each step has a working backend
counterpart — see `plan.md` for the integrated milestones):

1. **App shell + sidebar + API client (JWT header, refresh)**
2. **Login**
3. **Dashboard** (`GET /dashboard` renders everything)
4. **Transactions + Add Transaction drawer**
5. **Accounts**
6. **Budgets**
7. **Savings & Goals**
8. **Loans**
9. **Analytics**
10. **Settings**

---

# 24. Core UI Principle

```text
Dashboard → Overview → Find Something Interesting
          → Click / Drill Down → Detailed Information → Filtered Actions
```

The interface should feel like a **financial control center**, not a collection
of disconnected pages.

# 25. Theming — Light & Dark (2026-09-06)

Groww-style dark mode, app-wide. Light mode is visually identical to the
pre-theme design.

- **Mechanism** — class-based dark variant in Tailwind v4: `@custom-variant
  dark` in `index.css`; `.dark` is toggled on `<html>`.
- **Persistence** — `theme/ThemeContext.tsx` stores the choice in
  `localStorage` (`ft-theme`), defaults to the OS `prefers-color-scheme`, and
  keeps following the OS until the user picks a side. `index.html` carries a
  mirrored pre-paint script so a dark reload never flashes light — the key
  name and logic must stay in sync with `ThemeContext`.
- **Income/expense tokens** — `--income` / `--expense` CSS vars flip per mode
  and are exposed via `@theme inline`, so call sites write `text-income` /
  `text-expense` with no `dark:` prefix. Light: emerald-600 / rose-600. Dark:
  neon green `#00e09e` (income) and rose-400 `#fb7185` (expense) — red was
  kept for expense after a blue trial (2026-09-06) because red reads more
  meaningfully. Danger (delete, validation errors) shares the red family, as
  in light mode; transfer stays blue and loan amber in both modes.
- **Surfaces** — slate scale: app `dark:bg-slate-950`, cards/panels
  `dark:bg-slate-900`, hovers `dark:hover:bg-slate-800`, borders
  `dark:border-slate-800`. Shared primitives (`components/ui.tsx`) own most of
  it — pages add only local overrides.
- **Special cases** — PeriodSelector's active pill inverts
  (`dark:bg-slate-100 dark:text-slate-900`); LoanDetail's timeline start dot
  likewise; GoalDetail's checkbox uses `dark:accent-income`; the login brand
  panel goes deep-green (`dark:bg-brand-500/10`) with the sparkline reclassed
  to `fill-/stroke-brand-*` utilities.
- **Charts** — Recharts takes colors as JS props, so pages call
  `chartTheme(isDark)` from `lib/chartTheme.ts` (grid, axes, tick fill, tooltip
  panel, series, donut palette) via `useTheme()`. Never hardcode chart hexes.
- **Toggles** — `components/ThemeToggle.tsx` (sun/moon icon button), mounted
  in: sidebar footer (`AppShell`), login header, reset-password corner, and
  Settings → Appearance. `meta[name=theme-color]` follows the mode.

