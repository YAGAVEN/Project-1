-- V4__idempotency_keys.sql
-- Audit Phase 2 (H-3): financial writes need server-side idempotency. A POST
-- that commits but loses its response (mobile network drop, retry race) must
-- replay its original response on the next attempt instead of creating a
-- second transaction. The SPA sends a client-generated UUID as the
-- Idempotency-Key header on the initial POST and on every outbox flush retry
-- of the same logical transaction.
--
-- Same RLS model as V3: the table is deny-all for the anon/authenticated
-- REST roles; the backend's postgres owner bypasses RLS (no FORCE).

create table idempotency_keys (
    user_id          uuid not null references profiles (id) on delete cascade,
    idempotency_key  varchar(255) not null,
    request_hash     varchar(64) not null,          -- sha-256 of method+body; rejects key reuse with a different payload
    status           varchar(12) not null default 'PENDING'
                     check (status in ('PENDING', 'COMPLETED')),
    response_status  smallint,                      -- captured on completion, replayed verbatim
    response_body    text,                          -- serialized TransactionResponse, replayed verbatim
    created_at       timestamptz not null default now(),
    primary key (user_id, idempotency_key)
);

-- Cleanup helper: expired keys are pruned oldest-first (no purge job yet —
-- one row per created transaction keeps the table small for years).
create index idx_idempotency_user_created on idempotency_keys (user_id, created_at);

-- REST hardening (same pattern as V3 — new tables must never ship without it).
alter table idempotency_keys enable row level security;
create policy deny_client_rest_access on idempotency_keys
    for all to anon, authenticated using (false) with check (false);
revoke all on idempotency_keys from anon, authenticated;
