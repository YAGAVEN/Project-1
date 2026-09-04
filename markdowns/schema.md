# Personal Finance Tracker — Database Schema (v2)

> **v2.** Aligned with the backend plan (`backend.md`) and the frontend spec
> (`frontend.md`). This file is the single source of truth for tables,
> constraints, and indexes. `plan.md` is the project index and handoff doc.

## 1. Scope

This schema supports the current core features:

- User authentication (Supabase Auth)
- Multiple bank, cash, credit card, and investment accounts
- Income and expense tracking
- Transfers between accounts
- Lending and borrowing tracking, with repayments
- Recurring budget templates per category
- Savings goals and goal contributions
- Manual entry only

Parked for future versions (the model does not depend on them):

- Transaction inbox / automatic imports
- Voice input
- Recurring transactions
- Notifications and alerts
- Billing-cycle credit card statements
- Multi-currency

---

# 2. Core Design Principles

1. A **transaction** records an actual financial event.
2. An **account** represents where money is held or owed.
3. A **category** describes the purpose of an income or expense.
4. A **budget** is a recurring limit template for a category — set once,
   applied to every period.
5. A **loan** is not income or expense. Lending and borrowing are dedicated
   transaction types so account balances stay correct.
6. A **credit card** is modeled as an account.
7. Paying a credit card bill is a transfer, not a second expense.
8. A **goal contribution** is an allocation toward a target and does not
   necessarily mean money moved.
9. All "current" values (balances, budget usage, loan outstanding, goal
   progress) are **derived from transactions** — never stored and hand-edited.
10. Every table carries `user_id`; all access is scoped to the owner.

---

# 3. Entity Relationship Overview

```text
auth.users
    |
    | 1 : 1
    v
profiles
    |
    +------------------+-------------------+------------------+
    |                  |                   |                  |
    v                  v                   v                  v
accounts           categories           contacts         savings_goals
    |                  |                   |                  |
    |                  |                   v                  v
    |                  |                 loans        goal_contributions
    |                  |                   |                  |
    +------------------+-------------------+                  |
                       |                                      |
                       v                                      |
                  transactions <------------ loan_payments     |
                       |  ^                    |               |
                       |  +--- loans.transaction_id            |
                       +-------------------------------------- (optional link)
```

---

# 4. `auth.users`

Managed by Supabase Auth.

This table handles:

- User ID
- Email
- Password authentication
- Authentication metadata

The application never stores a password column of its own. Login, refresh, and
password reset all happen through Supabase Auth; the Spring Boot API only
validates the issued JWT.

Primary key used by the application:

```text
id : UUID
```

---

# 5. `profiles`

Stores application-specific user information.

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key, references `auth.users.id` |
| `full_name` | User's display name |
| `preferred_currency` | Default currency, `INR` (single currency in v1) |
| `created_at` | Profile creation timestamp |
| `updated_at` | Last update timestamp |

## Provisioning

The API auto-creates this row on the user's first authenticated request, and
seeds the default categories (Section 7.4).

---

# 6. `accounts`

Represents where money is stored, available, invested, or owed.

Examples:

- HDFC Savings Account
- SBI Bank Account
- Cash Wallet
- Credit Card
- Investment Account

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner of the account |
| `name` | Account display name |
| `account_type` | `BANK`, `CASH`, `CREDIT_CARD`, or `INVESTMENT` |
| `opening_balance` | Balance when tracking started |
| `credit_limit` | Credit cards only |
| `billing_day` | Credit cards only (informational in v1) |
| `payment_due_day` | Credit cards only (informational in v1) |
| `is_active` | Whether the account is active |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Balance Derivation

```text
balance = opening_balance + money_in − money_out
```

The full in/out rules per transaction type are in Section 16.1. One formula
covers bank, cash, investment, and credit card accounts; a credit card balance
is normally negative and represents outstanding debt.

---

# 7. `categories`

Describes the purpose of an income or expense.

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner of the category |
| `name` | Category name |
| `category_type` | `INCOME` or `EXPENSE` |
| `parent_category_id` | Optional parent (one level only — a subcategory cannot have children) |
| `is_active` | Whether the category is active |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## 7.1 Category Types

```text
INCOME
EXPENSE
```

## 7.2 Subcategory Example (one level)

```text
Food
├── Restaurants
├── Food Delivery
└── Groceries
```

## 7.3 Budgets apply to EXPENSE categories only.

## 7.4 Default Seeding

On profile provisioning, the API inserts:

```text
EXPENSE: Food, Transport, Shopping, Entertainment, Subscriptions,
         Education, Health, Bills, Other
INCOME:  Salary, Freelance, Gift, Interest, Other Income
```

---

# 8. `transactions`

The central financial record. A transaction records an actual financial event.

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner of the transaction |
| `transaction_type` | One of the seven types below |
| `amount` | `NUMERIC(14,2)`, always positive |
| `from_account_id` | Account money leaves from (nullable, type-dependent) |
| `to_account_id` | Account money enters into (nullable, type-dependent) |
| `category_id` | Income or expense category (nullable, type-dependent) |
| `description` | Optional note |
| `transaction_date` | `DATE`, the effective date (IST) |
| `transaction_time` | `TIME`, optional; used only for the hourly DAY view |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

Constraints: `CHECK (amount > 0)`, `CHECK (from_account_id <> to_account_id)`.

## 8.1 Transaction Types

```text
INCOME               earned money enters an account
EXPENSE              real spending leaves an account
TRANSFER             moves between the user's own accounts
LOAN_GIVEN           money left my account to a contact     → receivable
LOAN_RECEIVED        money entered my account from a contact → liability
LOAN_REPAYMENT_IN    a contact paid me back                  → receivable decreases
LOAN_REPAYMENT_OUT   I paid back money I owed                → liability decreases
```

## 8.2 Per-Type Field Rules

| Type | from_account | to_account | category | Created via |
|---|---|---|---|---|
| INCOME | must be NULL | required, not a credit card | required, `INCOME` type | Transaction API |
| EXPENSE | required (card allowed) | must be NULL | required, `EXPENSE` type | Transaction API |
| TRANSFER | required | required, ≠ from | must be NULL | Transaction API |
| LOAN_GIVEN | required, not a credit card | must be NULL | must be NULL | Loan API |
| LOAN_RECEIVED | must be NULL | required, not a credit card | must be NULL | Loan API |
| LOAN_REPAYMENT_IN | must be NULL | required, not a credit card | must be NULL | Loan payment API |
| LOAN_REPAYMENT_OUT | required, not a credit card | must be NULL | must be NULL | Loan payment API |

Rationale for "not a credit card" on loan and income flows: lending from a card
is a cash advance, and money entering a card is a bill payment (modeled as
TRANSFER). Both are out of v1 scope.

`LOAN_*` transactions are created only through the loan endpoints; the generic
transaction API accepts only `INCOME`, `EXPENSE`, and `TRANSFER`.
`transaction_type` is immutable after creation.

## 8.3 Examples

```text
Salary ₹50,000           → INCOME,      to = HDFC,  category = Salary
Swiggy ₹500              → EXPENSE,     from = HDFC, category = Food
HDFC → SBI ₹10,000       → TRANSFER,    from = HDFC, to = SBI
Lent Arun ₹2,000 cash    → LOAN_GIVEN,  from = Cash
Dad sent ₹10,000         → LOAN_RECEIVED, to = HDFC
Arun repaid ₹1,000 UPI   → LOAN_REPAYMENT_IN,  to = HDFC
I repaid Dad ₹5,000      → LOAN_REPAYMENT_OUT, from = HDFC
```

---

# 9. Credit Card Handling

A credit card is an account with `account_type = CREDIT_CARD`.

## Purchase

```text
Type: EXPENSE
From Account: HDFC Credit Card
Category: Food
Amount: ₹500
```

Effects: expense ↑, card outstanding ↑, bank balance unchanged.

## Bill Payment

```text
Type: TRANSFER
From Account: HDFC Savings
To Account: HDFC Credit Card
Amount: ₹500
```

Effects: bank balance ↓, card outstanding ↓, expense total unchanged.

This prevents double counting.

## Derived Card Metrics

```text
outstanding     = −balance
monthSpend      = Σ EXPENSE from the card in the current month
availableCredit = credit_limit − outstanding
utilization     = outstanding / credit_limit × 100
```

---

# 10. `budgets`

A budget is a **recurring template**: one row per category, applied
automatically to every period of its type. There are no per-month rows.

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner |
| `category_id` | `EXPENSE` category being budgeted |
| `amount_limit` | Limit applied per period |
| `period_type` | `WEEKLY`, `MONTHLY`, or `YEARLY` |
| `is_active` | Off = keep the row, stop applying it |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

Constraint: **unique active template per (user, category, period_type)** —
partial unique index `WHERE is_active`.

## Usage (derived)

For the period containing the viewed anchor date:

```text
used      = Σ EXPENSE where category matches AND transaction_date in period window
remaining = amount_limit − used
status    = OK (< 80%) | WARNING (80–100%) | OVER (> 100%)
```

Because templates recur, the frontend's `< September 2026 >` month navigation
works with zero per-month setup.

---

# 11. `contacts`

People relevant to lending and borrowing.

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner |
| `name` | Contact name (Dad, Arun, Swiggy-relevant people, …) |
| `notes` | Optional |
| `created_at` / `updated_at` | Timestamps |

Per-contact summary (derived): `totalLent`, `totalReturned`, `totalBorrowed`,
`totalRepaid`, `netPending`.

---

# 12. `loans`

Money lent to or borrowed from a contact. A loan is backed by a real
money-movement transaction so account balances are always correct.

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner |
| `contact_id` | Person involved |
| `loan_type` | `LENT` or `BORROWED` |
| `original_amount` | Initial amount |
| `transaction_id` | **NOT NULL, UNIQUE** — the origin transaction (`LOAN_GIVEN` or `LOAN_RECEIVED`). The account involved is read from this transaction, not stored separately |
| `start_date` | Loan date |
| `status` | `ACTIVE`, `PAID`, `CANCELLED` (`PAID` set automatically when outstanding reaches 0) |
| `description` | Optional note |
| `created_at` / `updated_at` | Timestamps |

`original_amount` is immutable after creation — a mistake is fixed by deleting
the loan (allowed only while it has no payments) and creating a new one.

## Examples

```text
Lent Arun ₹5,000 from Cash
  loan_type = LENT, contact = Arun, amount = 5000
  origin transaction = LOAN_GIVEN from Cash   → Cash balance ↓, receivable +₹5,000

Dad lent me ₹10,000 into HDFC
  loan_type = BORROWED, contact = Dad, amount = 10000
  origin transaction = LOAN_RECEIVED to HDFC  → HDFC balance ↑, liability +₹10,000
```

---

# 13. `loan_payments`

Repayments against a loan. Every payment creates a real transaction.

## Fields

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `loan_id` | Loan being settled |
| `transaction_id` | **NOT NULL** — the repayment transaction |
| `amount` | Repayment amount |
| `payment_date` | Date of repayment |
| `created_at` | Creation timestamp |

## Direction Mapping

```text
LENT loan     payment → LOAN_REPAYMENT_IN   into the chosen account
BORROWED loan payment → LOAN_REPAYMENT_OUT  from the chosen account
```

## Outstanding (derived)

```text
outstanding = original_amount − Σ loan_payments.amount
status      = PAID when outstanding = 0, else ACTIVE
```

Deleting a payment deletes its transaction as well and recomputes loan status.

---

# 14. `savings_goals`

A target the user wants to save toward.

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `user_id` | Owner |
| `name` | Goal name (Emergency Fund, "Save ₹40,000 this year", Laptop, …) |
| `target_amount` | Target |
| `target_date` | Optional deadline |
| `status` | `ACTIVE`, `COMPLETED` (auto when progress ≥ target), `CANCELLED` |
| `description` | Optional note |
| `created_at` / `updated_at` | Timestamps |

---

# 15. `goal_contributions`

Progress toward a goal. A contribution is an **allocation** — it does not
necessarily mean money moved.

```text
Salary enters HDFC:            ₹50,000   (INCOME transaction)
"₹10,000 of that is for the Emergency Fund"
                               → goal contribution, no money movement
```

If money *does* move (e.g., HDFC → investment account), the user also records a
TRANSFER and the contribution links to it.

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `goal_id` | Goal receiving the contribution |
| `transaction_id` | Optional related transfer transaction |
| `amount` | Contribution amount |
| `contribution_date` | Date |
| `notes` | Optional |
| `created_at` | Creation timestamp |

```text
progress   = Σ contributions
percentage = progress / target_amount × 100
```

---

# 16. Financial Calculations (all derived)

## 16.1 Account Balance

```text
balance = opening_balance + Σ(money in) − Σ(money out)
```

| Type | from_account | to_account |
|---|---|---|
| INCOME | — | + |
| EXPENSE | − | — |
| TRANSFER | − | + |
| LOAN_GIVEN | − | — |
| LOAN_RECEIVED | — | + |
| LOAN_REPAYMENT_IN | — | + |
| LOAN_REPAYMENT_OUT | − | — |

## 16.2 Income, Expense, Net Cash Flow

```text
Income  = Σ INCOME in window        Expense = Σ EXPENSE in window
Net cash flow = Income − Expense
```

`TRANSFER` and all `LOAN_*` types never enter these totals. Lending is not
spending; borrowing is not earning.

## 16.3 Net Position and the Savings Page

```text
netPosition = Σ balance over all active accounts
              (credit cards contribute negative balances)

Liquid cash      = Σ balance of BANK + CASH accounts
Investments      = Σ balance of INVESTMENT accounts
Goals allocation = Σ contributions toward ACTIVE goals
```

Goals allocation is a **virtual label** on the same money — it must never be
added to liquid cash. Receivables/payables are shown separately
("You'll get ₹X" / "You owe ₹Y"), not inside net position.

---

# 17. Constraints and Indexes

```sql
CREATE INDEX idx_tx_user_date       ON transactions (user_id, transaction_date);
CREATE INDEX idx_tx_user_type_date  ON transactions (user_id, transaction_type, transaction_date);
CREATE INDEX idx_tx_category        ON transactions (category_id);
CREATE INDEX idx_tx_from_account    ON transactions (from_account_id);
CREATE INDEX idx_tx_to_account      ON transactions (to_account_id);
CREATE INDEX idx_accounts_user      ON accounts (user_id);
CREATE INDEX idx_budgets_user       ON budgets (user_id);
CREATE INDEX idx_loans_user         ON loans (user_id, status);
CREATE INDEX idx_payments_loan      ON loan_payments (loan_id);
CREATE INDEX idx_goals_user         ON savings_goals (user_id, status);
CREATE INDEX idx_contrib_goal       ON goal_contributions (goal_id);
CREATE UNIQUE INDEX uq_budget_template
    ON budgets (user_id, category_id, period_type) WHERE is_active;
CREATE UNIQUE INDEX uq_loan_origin  ON loans (transaction_id);
```

PostgreSQL does not index foreign keys automatically; the list above covers
every join path used by the API.

---

# 18. Deletion Policy

| Entity | Rule |
|---|---|
| Account | Deactivate if transactions exist; hard delete only if none |
| Category | Deactivate if referenced by transactions or active children; otherwise hard delete |
| Contact | Hard delete only if no loans reference it; otherwise 409 |
| Loan | Hard delete (loan + origin transaction, atomically) only if no payments exist; otherwise 409 |
| Transaction | Hard delete. `LOAN_*` types only through loan endpoints. Type immutable on update |
| Goal | Cancel if contributions exist; hard delete if none |
| Budget template | Hard delete (usage is derived, nothing orphaned) |
| Loan payment | Hard delete + its transaction; loan status recomputed |
| Contribution | Hard delete; goal status recomputed |

---

# 19. Tables Summary

| Table | Purpose |
|---|---|
| `profiles` | Application-specific user information |
| `accounts` | Bank, cash, credit card, and investment accounts |
| `categories` | Income and expense classification (one parent level) |
| `transactions` | Core financial events — seven types |
| `budgets` | Recurring spending-limit templates per category |
| `contacts` | People involved in lending and borrowing |
| `loans` | Money lent or borrowed, backed by an origin transaction |
| `loan_payments` | Repayments, each backed by a transaction |
| `savings_goals` | Financial saving targets |
| `goal_contributions` | Progress toward goals (allocations) |

---

# 20. Business Rules

1. Amounts are always positive and `NUMERIC(14,2)`.
2. Per-type account/category rules in Section 8.2 are enforced by the API.
3. Transfers never affect income, expense, or budgets.
4. A credit card purchase is an expense; the bill payment is a transfer.
5. Money lent is not an expense; money borrowed is not income.
6. Every loan and repayment is backed by a real transaction.
7. Loan outstanding = original − payments; status auto-flips to PAID at zero.
8. Budget usage is derived per template per period; one active template per
   category and period type.
9. Goal progress is derived from contributions; status auto-flips to COMPLETED
   at target.
10. Balances, usage, outstanding, and progress are always derived, never stored.
11. Every table is scoped by `user_id`; the API is the security boundary.
12. Currency is INR only; timezone is Asia/Kolkata.
