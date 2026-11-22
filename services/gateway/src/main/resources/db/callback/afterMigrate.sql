-- The gateway's own database role: rows only, no schema (the deep security
-- review of 2026-11-21, N4). Flyway runs as the database's owner
-- (spring.flyway.user, POSTGRES_USER) and, after every migrate, makes sure
-- the role the app signs in as (spring.datasource.username) exists with the
-- password it was handed, may read and write the rows of every table and
-- draw from every sequence, and owns nothing: no CREATE, ALTER, DROP or
-- TRUNCATE, so an injected statement could not change or drop the schema.
--
-- Skipped where the app and Flyway are one role (the Testcontainers tests,
-- and any stack that sets no app role): app_user is then empty or the role
-- Flyway itself runs as. The password is the stack's generated secret,
-- letters and digits only (deploy.sh, run.sh, the template's
-- ExcludePunctuation), so it is safe inside the quoted literal below.
--
-- The statement carries that password, so it is kept out of Postgres's log
-- for this session whatever happens (a failed or slow statement is
-- otherwise logged with its text); Flyway's owner role is the image's
-- superuser, which may set both.
SET log_min_error_statement = panic;
SET log_min_duration_statement = -1;

DO $$
DECLARE
  app text := '${app_user}';
BEGIN
  IF app = '' OR app = current_user THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = app) THEN
    EXECUTE format('CREATE ROLE %I LOGIN', app);
  END IF;
  -- Set on every start, so a rotated secret takes at the next deploy; and
  -- nothing more than LOGIN, whatever the role had been given before.
  EXECUTE format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    app, '${app_password}');
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', app);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app);
  -- What a later migration (or a restore, infra/server/backup.sh) creates
  -- as the owner gets the same, before this callback next runs.
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', app);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', app);
  -- Flyway's own history is the owner's to write; the app may read it.
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON flyway_schema_history FROM %I', app);
END
$$;

RESET log_min_duration_statement;
RESET log_min_error_statement;
