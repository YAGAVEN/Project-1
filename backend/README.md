# Backend — Personal Finance Tracker

Spring Boot 4 / Java 21 REST API. Supabase (PostgreSQL + Auth) is the only
backend dependency. Contract: `../backend.md` · data model: `../schema.md` ·
state: `../plan.md`.

## 1. Prerequisites

1. A Supabase project (dashboard → new project). Pick a region close to you.
2. From **Project Settings → Database**, note:
   - Connection string (use the **Session pooler**, port 5432)
   - Database password
3. From **Project Settings → API**, note the project URL.

## 2. Environment variables

Set these in IntelliJ before running: **Run → Edit Configurations →
BackendApplication → Environment variables**.

| Variable | Value | Example |
|---|---|---|
| `SPRING_DATASOURCE_URL` | Session pooler JDBC URL | `jdbc:postgresql://aws-0-ap-south-1.pooler.supabase.com:5432/postgres` |
| `SPRING_DATASOURCE_USERNAME` | Pooler user | `postgres.<project-ref>` |
| `SPRING_DATASOURCE_PASSWORD` | DB password | `••••••` |
| `SUPABASE_ISSUER` | Project URL + `/auth/v1` | `https://abcd.supabase.co/auth/v1` |
| `CORS_ALLOWED_ORIGINS` | Frontend origins | `http://localhost:5173` |

### JWT mode (pick one)

- **Preferred:** enable JWT **asymmetric signing keys** in the Supabase
  dashboard (Auth → JWT Keys), then set `SUPABASE_ISSUER` as above. Done.
- **Legacy HS256:** if you keep the legacy secret, unset `SUPABASE_ISSUER`
  and set `SUPABASE_JWT_SECRET` (Auth → JWT Keys → legacy secret) instead.

Neither is set → the app refuses to start with a clear message.

## 3. Run

```bash
./mvnw spring-boot:run
# or the green run button in IntelliJ
```

First boot: Flyway applies `src/main/resources/db/migration/V1__init.sql`
(all tables + indexes). Watch the log for
`Successfully applied 1 migration`.

> Note: `mvn test` needs the same env vars — the context-load test connects
> to the database.

## 4. Verify P0

| Check | How |
|---|---|
| Health | `GET http://localhost:8080/actuator/health` → `{"status":"UP"}` (no token) |
| Anything else without a token | `401` |
| Swagger | `http://localhost:8080/swagger-ui.html` (no token) |
| Profile + category seeding | `GET /api/v1/me` with `Authorization: Bearer <supabase access_token>` → creates your `profiles` row + 14 default categories |

To get an access token for step 4: log in via the Supabase JS client, or from
the dashboard create a user (Auth → Users → Add user) and call

```bash
curl -s https://<project-ref>.supabase.co/auth/v1/token?grant_type=password \
  -H "apikey: <anon key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"••••"}'
```

`access_token` from the response goes into the Authorization header.

## 5. Project layout

```text
src/main/java/org/finance/tracker/
├── config/     Security, JWT decoder, auditing, OpenAPI
├── common/     ApiException hierarchy, RFC 7807 handler
├── auth/       CurrentUser resolution, provisioning filter
├── profile/    /api/v1/me
├── category/   entities + default seeding (API lands in P1)
└── …           one package per module (backend.md §5)
```
