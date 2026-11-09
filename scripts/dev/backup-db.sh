#!/usr/bin/env bash
# The local stack's database, every database in the cluster, dumped each
# night to ~/Developer/branch-backup/db-YYYY-MM-DD.sql.gz, the last 14 kept.
#
# The pilots, aircraft, flights and sessions the owner tests with live in
# one Docker volume (pgdata_pg18), and the only copies so far were dumps
# taken by hand before a migration (db-before-*.sql.gz beside these, which
# this never touches). pg_dumpall, not pg_dump: the roles go with the rows,
# so a fresh volume takes the file whole (`gunzip -c db-....sql.gz | docker
# exec -i wingtip-db-1 psql -U wingtip -d postgres`).
#
# A dump is kept only when it is whole: non-empty, a gzip stream that tests
# clean (gunzip -t), and ending in pg_dumpall's own last line ("PostgreSQL
# database cluster dump complete"), which it writes only after every
# database. Otherwise the night's file is deleted, the older ones are left
# alone and the script fails, which launchd's log keeps.
#
#   scripts/dev/backup-db.sh            dump now
#
# Run each night at 03:30 by launchd (scripts/dev/install-backup.sh puts it
# there). Settings, all optional: DB_CONTAINER (wingtip-db-1), DB_USER
# (wingtip, the image's superuser; no password over the container's own
# socket), BACKUP_DIR (~/Developer/branch-backup), BACKUP_KEEP (14).
set -euo pipefail

# launchd starts this with a bare PATH; Docker Desktop's CLI is not on it.
PATH=$PATH:/usr/local/bin:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin

container=${DB_CONTAINER:-wingtip-db-1}
user=${DB_USER:-wingtip}
dir=${BACKUP_DIR:-$HOME/Developer/branch-backup}
keep=${BACKUP_KEEP:-14}
day=$(date +%Y-%m-%d)
file="$dir/db-$day.sql.gz"
partial="$file.partial"

say() { echo "$(date '+%Y-%m-%d %H:%M:%S') backup-db: $*"; }

if ! docker info >/dev/null 2>&1; then
  say "Docker is not running; no dump tonight" >&2
  exit 69
fi
if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" != true ]; then
  say "$container is not running; no dump tonight" >&2
  exit 69
fi

mkdir -p "$dir"
trap 'rm -f "$partial"' EXIT
started=$(date +%s)
docker exec "$container" pg_dumpall -U "$user" | gzip -9 > "$partial"

# Whole, or not kept.
if [ ! -s "$partial" ]; then
  say "the dump is empty" >&2
  exit 1
fi
if ! gunzip -t "$partial"; then
  say "the dump is not a whole gzip stream" >&2
  exit 1
fi
# Read whole into tail, then matched: grep -q leaving a pipe early would
# fail it under pipefail.
ending=$(gunzip -c "$partial" | tail -n 5)
if [[ "$ending" != *"PostgreSQL database cluster dump complete"* ]]; then
  say "the dump does not end in pg_dumpall's last line: cut short" >&2
  exit 1
fi
mv "$partial" "$file"
trap - EXIT
size=$(du -h "$file" | cut -f1 | tr -d ' ')
databases=$(gunzip -c "$file" | grep -c '^\\connect' || true)
say "wrote $file ($size, $databases databases, $(( $(date +%s) - started )) s)"

# The newest $keep nightly files kept; only the nightly names are counted,
# never a dump taken by hand under another name.
nightly=()
for path in "$dir"/db-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].sql.gz; do
  [ -e "$path" ] && nightly+=("$path")
done
# The glob sorts by name, which is by date; the oldest come first.
while [ "${#nightly[@]}" -gt "$keep" ]; do
  rm -f "${nightly[0]}"
  say "removed $(basename "${nightly[0]}") (keeping the newest $keep)"
  nightly=("${nightly[@]:1}")
done
