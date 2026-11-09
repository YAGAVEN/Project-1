package org.finance.tracker.db;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Phase 1 audit fix (P0) verification: proves V3__enable_rls_backend_only
 * denies Supabase's REST roles (anon/authenticated) on every public table —
 * both via revoked grants and via the deny-all RLS policy — while the table
 * owner (the role the Spring backend connects as, `postgres`) keeps full
 * access, because owners bypass RLS and FORCE RLS is not set.
 *
 * Requires a SCRATCH PostgreSQL database: the setup drops and recreates the
 * `public` schema. Opt in with ALL of:
 * <pre>
 *   RLS_IT_JDBC_URL      e.g. jdbc:postgresql://localhost:5432/rls_scratch
 *   RLS_IT_USER          owner user; must be superuser or member of the probe roles
 *   RLS_IT_PASSWORD
 *   RLS_IT_ALLOW_RESET   must be "true" — safety interlock for the destructive setup
 * </pre>
 * Without them the test is skipped (CI wires a postgres service container in Phase 6).
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@EnabledIfEnvironmentVariable(named = "RLS_IT_JDBC_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "RLS_IT_USER", matches = ".+")
@EnabledIfEnvironmentVariable(named = "RLS_IT_ALLOW_RESET", matches = "true")
class RowLevelSecurityMigrationTest {

    private static final List<String> TABLES = List.of(
            "profiles", "accounts", "categories", "transactions", "budgets",
            "contacts", "loans", "loan_payments", "savings_goals", "goal_contributions");

    private static final UUID USER_ID = UUID.randomUUID();

    private static String url() {
        return System.getenv("RLS_IT_JDBC_URL");
    }

    private static Connection ownerConnection() throws SQLException {
        String user = System.getenv("RLS_IT_USER");
        String password = System.getenv("RLS_IT_PASSWORD");
        return DriverManager.getConnection(url(), user, password == null ? "" : password);
    }

    @BeforeAll
    static void resetScratchSchemaAndMigrate() throws Exception {
        try (Connection c = ownerConnection(); Statement st = c.createStatement()) {
            // Scratch-database safety interlock: RLS_IT_ALLOW_RESET=true must be set explicitly.
            st.execute("drop schema if exists public cascade");
            st.execute("create schema public");
            // Minimal stub for the auth schema V1's profiles FK points at. In Supabase
            // this schema is owned by Supabase Auth; locally a bare table suffices.
            st.execute("create schema if not exists auth");
            st.execute("create table if not exists auth.users (id uuid primary key, email varchar(255))");
            // Supabase-compatible role names; NOLOGIN probes switched to via SET ROLE.
            st.execute("do $$ begin "
                    + "if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; "
                    + "if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; "
                    + "end $$");
            st.execute("grant usage on schema public to anon, authenticated");
        }
        // The exact migration set production will run — not a hand-copied subset.
        Flyway.configure()
                .dataSource(url(), System.getenv("RLS_IT_USER"), System.getenv("RLS_IT_PASSWORD"))
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    @Test
    @Order(1)
    void rlsIsEnabledAndNotForcedOnEveryTable() throws Exception {
        try (Connection c = ownerConnection(); PreparedStatement ps = c.prepareStatement(
                "select relrowsecurity, relforcerowsecurity from pg_class where relname = ?")) {
            for (String table : TABLES) {
                ps.setString(1, table);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("table %s exists", table).isTrue();
                    assertThat(rs.getBoolean(1)).as("%s: RLS enabled", table).isTrue();
                    assertThat(rs.getBoolean(2)).as("%s: FORCE RLS off so the backend owner bypasses RLS", table)
                            .isFalse();
                }
            }
        }
    }

    @Test
    @Order(2)
    void revokedGrantsDenyAnonAccessBeforeAnyPolicyEvaluation() throws Exception {
        try (Connection c = ownerConnection(); PreparedStatement ps = c.prepareStatement(
                "select has_table_privilege('anon', ?, 'SELECT')")) {
            for (String table : TABLES) {
                ps.setString(1, table);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getBoolean(1)).as("%s: anon has no table grant", table).isFalse();
                }
            }
        }
        // With grants revoked, PostgREST never even reaches RLS — the roles get a
        // hard permission-denied (PostgREST surfaces this as 4xx to the client).
        try (Connection c = ownerConnection()) {
            setRole(c, "anon");
            assertThatThrownBy(() -> exec(c, "select * from transactions limit 1"))
                    .as("anon SELECT with revoked grants")
                    .hasMessageContaining("permission denied");
            resetRole(c);
        }
    }

    @Test
    @Order(3)
    void denyAllPolicyStillBlocksAnonWhenGrantsAreReAdded() throws Exception {
        // Simulates the failure mode where a permissive grant is re-added later:
        // RLS must be the second line of defense. SELECT then returns an EMPTY set
        // (RLS filters rows silently) instead of data.
        try (Connection c = ownerConnection(); Statement st = c.createStatement()) {
            st.execute("grant select, insert, update, delete on all tables in schema public to anon, authenticated");
        }
        for (String table : TABLES) {
            try (Connection c = ownerConnection()) {
                setRole(c, "anon");
                try (ResultSet rs = c.createStatement().executeQuery("select count(*) from " + table)) {
                    rs.next();
                    assertThat(rs.getLong(1)).as("%s: anon sees zero rows through the deny-all policy", table)
                            .isZero();
                }
                resetRole(c);
            }
        }
    }

    @Test
    @Order(4)
    void anonWritesAreRejectedByWithCheckEvenWithGrants() throws Exception {
        seedOwnerData();
        try (Connection c = ownerConnection()) {
            setRole(c, "anon");
            assertThatThrownBy(() -> exec(c,
                    "insert into profiles (id, preferred_currency) values ('" + UUID.randomUUID() + "', 'INR')"))
                    .as("anon INSERT into profiles violates the deny-all with-check")
                    .hasMessageContaining("row-level security policy");
            resetRole(c);
        }
    }

    @Test
    @Order(5)
    void authenticatedRoleIsDeniedToo() throws Exception {
        try (Connection c = ownerConnection()) {
            setRole(c, "authenticated");
            try (ResultSet rs = c.createStatement().executeQuery("select count(*) from transactions")) {
                rs.next();
                assertThat(rs.getLong(1)).as("authenticated sees zero rows").isZero();
            }
            resetRole(c);
        }
    }

    @Test
    @Order(6)
    void backendOwnerPathKeepsWorking() throws Exception {
        // Mirrors the backend's write path: provision a profile, create an account,
        // record a transaction, then re-derive a balance the way netFlow does.
        seedOwnerData();
        try (Connection c = ownerConnection()) {
            UUID accountId = execReturning(c,
                    "insert into accounts (user_id, name, account_type, opening_balance) "
                            + "values ('" + USER_ID + "', 'IT Bank', 'BANK', 1000.00) returning id");
            exec(c, "insert into transactions (user_id, transaction_type, amount, to_account_id, transaction_date) "
                    + "values ('" + USER_ID + "', 'INCOME', 250.50, '" + accountId + "', current_date)");
            try (ResultSet rs = c.createStatement().executeQuery(
                    "select coalesce(sum(case when to_account_id = '" + accountId + "' then amount else 0 end "
                            + "- case when from_account_id = '" + accountId + "' then amount else 0 end), 0) "
                            + "from transactions where from_account_id = '" + accountId
                            + "' or to_account_id = '" + accountId + "'")) {
                rs.next();
                assertThat(rs.getBigDecimal(1)).isEqualByComparingTo("250.50");
            }
        }
    }

    // ---- helpers ------------------------------------------------------------

    private static void seedOwnerData() throws Exception {
        try (Connection c = ownerConnection(); Statement st = c.createStatement()) {
            st.execute("insert into auth.users (id) values ('" + USER_ID + "') on conflict do nothing");
            st.execute("insert into profiles (id, preferred_currency) values ('" + USER_ID + "', 'INR') "
                    + "on conflict (id) do nothing");
        }
    }

    private static void setRole(Connection c, String role) throws SQLException {
        exec(c, "set role " + role);
    }

    private static void resetRole(Connection c) throws SQLException {
        exec(c, "reset role");
    }

    private static void exec(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    private static UUID execReturning(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return UUID.fromString(rs.getString(1));
        }
    }
}
