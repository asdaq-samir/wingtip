#!/usr/bin/env bash
# The restore drill: a backup brought up in a scratch stack of its own and
# checked, so a backup that cannot be restored is found on a quiet day,
# not the day it is needed (the ops audit, 2026-11-21). docs/RUNBOOKS.md,
# "Restore a backup", is the real restore step by step; this is the same
# restore, thrown away after.
#
#   scripts/dev/one-at-a-time.sh "restore drill" scripts/dev/restore-drill.sh [BACKUP]
#
# BACKUP is one of:
#   s3://<ServerBucketName>/backups/<date>   a night of the server's (backup.sh):
#                                            postgres.dump, manifest.txt, labels.tar.gz;
#                                            needs the AWS CLI signed in
#   <a folder>                               the same three files, copied down
#   <a file>.sql.gz                          a nightly dump of the local stack
#                                            (scripts/dev/backup-db.sh)
# With none, the newest of ~/Developer/branch-backup/db-*.sql.gz.
#
# What it does, on a Docker network of its own with no port published:
#  1. Postgres at production's version, empty, and the dump restored into
#     it as README-AWS says (pg_restore --exit-on-error, or psql for a
#     pg_dumpall file).
#  2. Checks the restore: Flyway's history whole (no failed migration),
#     every table the manifest lists there, none that had rows come back
#     empty; the labels archive whole.
#  3. The gateway (GATEWAY_IMAGE, the live stack's own wingtip-gateway by
#     default; "none" to skip) started on the restored database: Flyway
#     migrates it to this checkout's newest version, Hibernate validates the
#     schema, its readiness says UP, and every account deleted after the
#     backup (deleted_accounts) is deleted again (DeletionsReapplied).
#  4. Everything removed, however it ends.
#
# Exit 0 and "restore drill passed" when every check passed; else the
# first that failed, said.
set -euo pipefail
cd "$(dirname "$0")/../.."

backup=${1:-$(ls -1 "$HOME"/Developer/branch-backup/db-[0-9]*.sql.gz 2> /dev/null | tail -1 || true)}
[ -n "$backup" ] || { echo "restore drill: no backup given and none in ~/Developer/branch-backup" >&2; exit 2; }
gateway_image=${GATEWAY_IMAGE:-wingtip-gateway}
db_image=$(sed -n 's/^ *image: \(postgres:[^ ]*\).*/\1/p' infra/docker-compose.prod.yml | head -1)
newest=$(ls services/gateway/src/main/resources/db/migration | sed -n 's/^V\([0-9]*\)__.*/\1/p' | sort -n | tail -1)
id=wingtip-drill-$$
net=$id db=$id-db gw=$id-gateway
work=$(mktemp -d)
cleanup() {
  docker rm -f "$db" "$gw" > /dev/null 2>&1 || true
  docker network rm "$net" > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
say() { echo "restore drill: $*"; }
fail() { echo "restore drill FAILED: $*" >&2; exit 1; }

# The backup, as files here.
case "$backup" in
  s3://*)
    say "fetching $backup"
    for f in postgres.dump manifest.txt labels.tar.gz; do
      aws s3 cp --only-show-errors "${backup%/}/$f" "$work/$f" || [ "$f" != postgres.dump ] || fail "no postgres.dump at $backup"
    done
    ;;
  *.sql.gz) cp "$backup" "$work/cluster.sql.gz" ;;
  *)
    [ -d "$backup" ] && [ -f "$backup/postgres.dump" ] || fail "$backup is neither s3://..., a folder with postgres.dump, nor a .sql.gz"
    cp "$backup"/postgres.dump "$work/"
    for f in manifest.txt labels.tar.gz; do [ ! -f "$backup/$f" ] || cp "$backup/$f" "$work/"; done
    ;;
esac

# 1. Postgres, empty, and the restore.
docker network create "$net" > /dev/null
docker run -d --name "$db" --network "$net" --network-alias db --memory 1g \
  -e POSTGRES_DB=wingtip -e POSTGRES_USER=wingtip -e POSTGRES_PASSWORD=drill "$db_image" > /dev/null
for _ in $(seq 60); do
  docker exec "$db" pg_isready -U wingtip -d wingtip -q 2> /dev/null && break
  sleep 1
done
sleep 2 # the image's first start restarts the server once its set-up is done
until docker exec "$db" psql -U wingtip -d wingtip -qc 'select 1' > /dev/null 2>&1; do sleep 1; done
psql() { docker exec -i "$db" psql -U wingtip -d wingtip -v ON_ERROR_STOP=1 -Atc "$1"; }

started=$(date +%s)
if [ -f "$work/postgres.dump" ]; then
  say "restoring postgres.dump ($(du -h "$work/postgres.dump" | cut -f1 | tr -d ' '))"
  docker exec -i "$db" pg_restore -U wingtip -d wingtip --exit-on-error --single-transaction < "$work/postgres.dump" ||
    fail "pg_restore stopped on an error"
else
  # pg_dumpall's roles come first; the image's own wingtip role is already
  # there, so its CREATE ROLE fails and the rest goes on (as the night's CI
  # drill, scripts/ci/backup_restore.sh, restores it).
  say "restoring $(basename "$backup") (pg_dumpall)"
  gunzip -c "$work/cluster.sql.gz" | docker exec -i "$db" psql -U wingtip -d postgres -q -v ON_ERROR_STOP=0 > "$work/restore.log" 2>&1 || true
  grep -v 'already exists' "$work/restore.log" | grep -m5 'ERROR' && fail "the dump restored with errors (above)"
  # Its ALTER ROLE then sets the dumped stack's password on wingtip, so the
  # gateway below could not sign in with the drill's (its first run,
  # 2026-11-21: "password authentication failed"). The drill's again.
  psql "ALTER ROLE wingtip PASSWORD 'drill'" > /dev/null
fi
say "restored in $(( $(date +%s) - started )) s"

# 2. What came back.
[ "$(psql "SELECT to_regclass('public.flyway_schema_history') IS NOT NULL")" = t ] || fail "no flyway_schema_history: not the gateway's database"
[ "$(psql "SELECT count(*) FROM flyway_schema_history WHERE NOT success")" = 0 ] || fail "the backup holds a failed migration"
version=$(psql "SELECT max(version::int) FROM flyway_schema_history WHERE success AND version IS NOT NULL")
pilots=$(psql "SELECT count(*) FROM pilots")
say "schema at V$version (this checkout's newest V$newest), $pilots pilots"
if [ -f "$work/manifest.txt" ]; then
  checked=0
  while read -r kind table rows; do
    [ "$kind" = rows ] || continue
    [ "$(psql "SELECT to_regclass('public.\"$table\"') IS NOT NULL")" = t ] || fail "table $table, in the manifest, is missing"
    now=$(psql "SELECT count(*) FROM public.\"$table\"")
    [ "$rows" = 0 ] || [ "$now" != 0 ] || fail "table $table had $rows rows and came back empty"
    [ "$now" = "$rows" ] || say "  $table: $now rows, the manifest $rows (written in the minute between the count and the dump)"
    checked=$((checked + 1))
  done < "$work/manifest.txt"
  say "every one of the manifest's $checked tables there, none emptied"
fi
if [ -f "$work/labels.tar.gz" ]; then
  notes=$(tar -tzf "$work/labels.tar.gz" | grep -vc '/$' || true)
  say "labels.tar.gz whole: $notes files"
fi

# 3. The gateway on it: migrated, validated, ready, deletions applied again.
if [ "$gateway_image" = none ]; then
  say "the gateway left out (GATEWAY_IMAGE=none)"
else
  docker image inspect "$gateway_image" > /dev/null 2>&1 || fail "no image $gateway_image here (build it, or GATEWAY_IMAGE=none)"
  noted=$(psql "SELECT count(*) FROM deleted_accounts" 2> /dev/null || echo 0)
  docker run -d --name "$gw" --network "$net" --memory 1g \
    -e SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/wingtip -e SPRING_DATASOURCE_USERNAME=wingtip \
    -e SPRING_DATASOURCE_PASSWORD=drill -e PLANNER_SERVICE_URL=http://planner.invalid:8000 \
    -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:TieredStopAtLevel=1" "$gateway_image" > /dev/null
  ready=no
  for _ in $(seq 90); do
    if docker exec "$gw" bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 &&
      printf "GET /actuator/health/readiness HTTP/1.0\r\nHost: localhost\r\n\r\n" >&3 && grep -q "\"status\":\"UP\"" <&3' 2> /dev/null; then
      ready=yes
      break
    fi
    [ "$(docker inspect -f '{{.State.Running}}' "$gw")" = true ] || break
    sleep 2
  done
  [ "$ready" = yes ] || { docker logs --tail 40 "$gw" >&2; fail "the gateway did not come up on the restored database (its log above)"; }
  migrated=$(psql "SELECT max(version::int) FROM flyway_schema_history WHERE success AND version IS NOT NULL")
  # The gateway's image may be newer than this checkout (built from a
  # branch with a migration this one lacks: V49 on its first run,
  # 2026-11-21); below this checkout's newest is the failure.
  [ "$migrated" -ge "$newest" ] || fail "Flyway left the schema at V$migrated, not V$newest"
  [ "$migrated" = "$newest" ] || say "the gateway's image migrates to V$migrated, newer than this checkout's V$newest"
  back=$(psql "SELECT count(*) FROM pilots p JOIN deleted_accounts d ON d.pilot_id = p.id")
  [ "$back" = 0 ] || fail "$back deleted accounts are back after the gateway started (DeletionsReapplied)"
  say "the gateway ready on it: migrated V$version to V$migrated, $noted deletions noted, none back"
fi
say "restore drill passed ($backup)"
