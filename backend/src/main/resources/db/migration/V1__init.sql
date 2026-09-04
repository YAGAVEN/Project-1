-- V1__init.sql
-- Personal Finance Tracker — initial schema (schema.md v2)
-- Flyway applies this automatically on first application startup.

-- =============================================================
-- profiles — application data for each auth.users row
-- =============================================================
create table profiles (
    id                  uuid primary key references auth.users (id) on delete cascade,
    full_name           varchar(120),
    preferred_currency  varchar(8)  not null default 'INR',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- =============================================================
-- accounts — bank, cash, credit card, investment
-- =============================================================
create table accounts (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references profiles (id) on delete cascade,
    name              varchar(120) not null,
    account_type      varchar(20)  not null
                      check (account_type in ('BANK', 'CASH', 'CREDIT_CARD', 'INVESTMENT')),
    opening_balance   numeric(14,2) not null default 0,
    credit_limit      numeric(14,2),          -- CREDIT_CARD only
    billing_day       smallint check (billing_day between 1 and 31),      -- CREDIT_CARD only
    payment_due_day   smallint check (payment_due_day between 1 and 31),  -- CREDIT_CARD only
    is_active         boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- =============================================================
-- categories — INCOME / EXPENSE, one parent level
-- =============================================================
create table categories (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references profiles (id) on delete cascade,
    name                varchar(120) not null,
    category_type       varchar(10)  not null check (category_type in ('INCOME', 'EXPENSE')),
    parent_category_id  uuid references categories (id),
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- =============================================================
-- transactions — seven types (schema.md §8)
-- =============================================================
create table transactions (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references profiles (id) on delete cascade,
    transaction_type  varchar(20) not null
                      check (transaction_type in (
                          'INCOME', 'EXPENSE', 'TRANSFER',
                          'LOAN_GIVEN', 'LOAN_RECEIVED',
                          'LOAN_REPAYMENT_IN', 'LOAN_REPAYMENT_OUT')),
    amount            numeric(14,2) not null check (amount > 0),
    from_account_id   uuid references accounts (id),
    to_account_id     uuid references accounts (id),
    category_id       uuid references categories (id),
    description       varchar(500),
    transaction_date  date not null,
    transaction_time  time,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    check (from_account_id is null
           or to_account_id is null
           or from_account_id <> to_account_id)
);

-- =============================================================
-- budgets — recurring templates (schema.md §10)
-- =============================================================
create table budgets (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references profiles (id) on delete cascade,
    category_id   uuid not null references categories (id),
    amount_limit  numeric(14,2) not null check (amount_limit > 0),
    period_type   varchar(10) not null check (period_type in ('WEEKLY', 'MONTHLY', 'YEARLY')),
    is_active     boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- =============================================================
-- contacts — people for lending / borrowing
-- =============================================================
create table contacts (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references profiles (id) on delete cascade,
    name        varchar(120) not null,
    notes       varchar(500),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- =============================================================
-- loans — backed by the origin money-movement transaction
-- =============================================================
create table loans (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references profiles (id) on delete cascade,
    contact_id       uuid not null references contacts (id),
    loan_type        varchar(10) not null check (loan_type in ('LENT', 'BORROWED')),
    original_amount  numeric(14,2) not null check (original_amount > 0),
    transaction_id   uuid not null unique references transactions (id),   -- origin movement
    start_date       date not null,
    status           varchar(12) not null default 'ACTIVE'
                     check (status in ('ACTIVE', 'PAID', 'CANCELLED')),
    description      varchar(500),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- =============================================================
-- loan_payments — each backed by a repayment transaction
-- =============================================================
create table loan_payments (
    id              uuid primary key default gen_random_uuid(),
    loan_id         uuid not null references loans (id) on delete cascade,
    transaction_id  uuid not null unique references transactions (id),
    amount          numeric(14,2) not null check (amount > 0),
    payment_date    date not null,
    created_at      timestamptz not null default now()
);

-- =============================================================
-- savings_goals + goal_contributions
-- =============================================================
create table savings_goals (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references profiles (id) on delete cascade,
    name           varchar(120) not null,
    target_amount  numeric(14,2) not null check (target_amount > 0),
    target_date    date,
    status         varchar(12) not null default 'ACTIVE'
                   check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    description    varchar(500),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table goal_contributions (
    id                 uuid primary key default gen_random_uuid(),
    goal_id            uuid not null references savings_goals (id) on delete cascade,
    transaction_id     uuid references transactions (id),   -- optional linked transfer
    amount             numeric(14,2) not null check (amount > 0),
    contribution_date  date not null,
    notes              varchar(500),
    created_at         timestamptz not null default now()
);

-- =============================================================
-- indexes (schema.md §17) — Postgres does not index FKs automatically
-- =============================================================
create index idx_tx_user_date       on transactions (user_id, transaction_date);
create index idx_tx_user_type_date  on transactions (user_id, transaction_type, transaction_date);
create index idx_tx_category        on transactions (category_id);
create index idx_tx_from_account    on transactions (from_account_id);
create index idx_tx_to_account      on transactions (to_account_id);
create index idx_accounts_user      on accounts (user_id);
create index idx_budgets_user       on budgets (user_id);
create index idx_loans_user         on loans (user_id, status);
create index idx_payments_loan      on loan_payments (loan_id);
create index idx_goals_user         on savings_goals (user_id, status);
create index idx_contrib_goal       on goal_contributions (goal_id);
create unique index uq_budget_template
    on budgets (user_id, category_id, period_type) where is_active;
