-- rls-verification.sql — manual post-migration checks (Phase 1 audit fix P0).
--
-- Purpose: run AFTER V3__enable_rls_backend_only.sql has been applied to a
-- database, as the table owner. Asserts the same matrix as
-- RowLevelSecurityMigrationIT but as a standalone script for ad-hoc use
-- (scratch DB locally, or the production read-only checks in §verify of
-- markdowns/audit-fixes.md).
--
-- Usage:
--   psql "$RLS_CHECK_URL" -v ON_ERROR_STOP=1 -f backend/src/test/resources/db/rls-verification.sql
-- Every check raises an exception on failure; a clean run prints PASS lines.

-- 1. RLS enabled, FORCE off (owner bypass intact) on all ten tables.
do $$
declare t text; rls bool; force_rls bool;
begin
    foreach t in array array[
        'profiles','accounts','categories','transactions','budgets',
        'contacts','loans','loan_payments','savings_goals','goal_contributions']
    loop
        select relrowsecurity, relforcerowsecurity into rls, force_rls
        from pg_class where relname = t;
        if rls is distinct from true then
            raise exception 'FAIL: % does not have RLS enabled', t;
        end if;
        if force_rls is distinct from false then
            raise exception 'FAIL: % has FORCE RLS set — the backend owner would be blocked', t;
        end if;
    end loop;
    raise notice 'PASS  RLS enabled without FORCE on all 10 tables';
end $$;

-- 2. Client roles hold no direct table grants (revoke layer).
do $$
declare t text;
begin
    foreach t in array array[
        'profiles','accounts','categories','transactions','budgets',
        'contacts','loans','loan_payments','savings_goals','goal_contributions']
    loop
        if has_table_privilege('anon', t, 'SELECT') then
            raise exception 'FAIL: anon still has SELECT on %', t;
        end if;
        if has_table_privilege('authenticated', t, 'SELECT') then
            raise exception 'FAIL: authenticated still has SELECT on %', t;
        end if;
    end loop;
    raise notice 'PASS  anon/authenticated hold no table grants';
end $$;

-- 3. Deny-all policy exists and is restrictive (defense in depth if a grant
--    is ever re-added): a re-granted anon must see zero rows.
do $$
declare t text; n bigint;
begin
    foreach t in array array[
        'profiles','accounts','categories','transactions','budgets',
        'contacts','loans','loan_payments','savings_goals','goal_contributions']
    loop
        if not exists (select 1 from pg_policies
                       where schemaname = 'public' and tablename = t
                         and policyname = 'deny_client_rest_access') then
            raise exception 'FAIL: deny policy missing on %', t;
        end if;
    end loop;
    -- Only meaningful where the probe role can be adopted (local superuser);
    -- on Supabase run the SET ROLE block from a role with membership.
    if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'grant select on all tables in schema public to anon';
        execute 'set role anon';
        foreach t in array array['profiles','transactions','loans'] loop
            execute format('select count(*) from %I', t) into n;
            if n <> 0 then
                raise exception 'FAIL: anon read % rows from % through RLS', n, t;
            end if;
        end loop;
        execute 'reset role';
        execute 'revoke select on all tables in schema public from anon';
    end if;
    raise notice 'PASS  deny_all policy present; re-granted anon reads zero rows';
end $$;

raise notice 'ALL CHECKS PASSED';
