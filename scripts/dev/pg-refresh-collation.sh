#!/usr/bin/env bash
# Once, on a Mac whose database volume was made by the bookworm Postgres
# image (glibc 2.36), after the move to postgres:18-trixie (glibc 2.41,
# 2026-11-09): rebuilds what sorts text by the system's collation and
# records the new collation version, so Postgres stops warning "database
# has a collation version mismatch" on every connection. The steps are
# the ones that warning's own hint gives (PostgreSQL 18 docs, ALTER
# DATABASE ... REFRESH COLLATION VERSION).
#
#   scripts/dev/pg-refresh-collation.sh            the compose stack's db
#   scripts/dev/pg-refresh-collation.sh <container> any running Postgres
#
# Safe to run again: a database whose version already matches is left alone.
set -euo pipefail

container=${1:-$(docker compose -p wingtip ps -q db)}
[ -n "$container" ] || { echo "pg-refresh-collation: start the db first (docker compose up -d db)" >&2; exit 1; }
user=${POSTGRES_USER:-wingtip}
psql() { docker exec -i "$container" psql -v ON_ERROR_STOP=1 -qtA -U "$user" "$@"; }

stale=$(psql -d postgres -c "select datname from pg_database
  where datallowconn and datcollversion is distinct from pg_database_collation_actual_version(oid)" 2>/dev/null)
for db in $stale; do
  # REINDEX first: an index built under the old collation may order text
  # differently from the new one, and only then is the version recorded.
  psql -d "$db" -c "reindex database \"$db\"" 2>/dev/null
  psql -d "$db" -c "alter database \"$db\" refresh collation version" 2>/dev/null
  echo "pg-refresh-collation: $db reindexed and refreshed"
done
[ -n "$stale" ] || echo "pg-refresh-collation: every database's collation version matches"
