-- V3__enable_rls_backend_only.sql
-- Audit P0 fix (2026-10-12): every public table was readable AND writable
-- through Supabase's auto-REST API (PostgREST) with only the public anon key,
-- because RLS was disabled and Supabase's default privileges grant full table
-- access to the anon/authenticated roles. The anon key ships inside the SPA
-- bundle, so this was a complete authorization bypass of the Spring API
-- (verified against production: HTTP 200 with real rows on all 10 tables).
--
-- Access model after this migration:
--   * The Spring backend connects as role `postgres` (the session-pooler user
--     postgres.<project-ref> maps to it). Flyway created every table as that
--     role, so `postgres` is the table OWNER. Table owners bypass RLS unless
--     FORCE ROW LEVEL SECURITY is set — we deliberately do NOT force it, so
--     backend behavior is unchanged. Verified by the owner-path assertions in
--     RowLevelSecurityMigrationIT and by PGlite probe run (audit-fixes.md).
--   * anon / authenticated (the PostgREST roles): explicit deny-all policies
--     PLUS revoked table/sequence grants. Default-deny would suffice with RLS
--     on, but the explicit policy documents intent and the revoked grants keep
--     REST access denied even if a permissive policy is added later.
--
-- Data safety: DDL only — no rows are read, modified, or deleted.
-- Rollback: markdowns/audit-fixes.md § "Rollback" (never edit this file once applied).

do $$
declare
    t text;
    tables text[] := array[
        'profiles', 'accounts', 'categories', 'transactions', 'budgets',
        'contacts', 'loans', 'loan_payments', 'savings_goals', 'goal_contributions'
    ];
begin
    foreach t in array tables loop
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists deny_client_rest_access on %I', t);
        execute format(
            'create policy deny_client_rest_access on %I for all to anon, authenticated using (false) with check (false)',
            t);
        execute format('revoke all on %I from anon', t);
        execute format('revoke all on %I from authenticated', t);
    end loop;

    -- Sequences are not needed by REST clients (all PKs are app-generated UUIDs),
    -- but revoke defensively so future serial columns are not exposed either.
    revoke all on all sequences in schema public from anon, authenticated;
end $$;
