#!/usr/bin/env bash
# The night's restore drill (ci.yml's backup-restore job; the audit of 6 Nov,
# C13: no backup was ever restored). A throwaway Postgres, at the stack's
# version, given a role, a table and rows; scripts/dev/backup-db.sh dumps it
# as it dumps the owner's each night; the dump restored whole into a second,
# empty Postgres, as its header says to; and the rows counted there. A dump
# that cannot be restored fails here, not on the day it is needed.
#
#   scripts/ci/backup_restore.sh     Docker only; leaves nothing behind
set -euo pipefail
cd "$(dirname "$0")/../.."
image=$(sed -n 's/^ *image: \(postgres:[^ ]*\).*/\1/p' docker-compose.yml | head -1)
src=wingtip-restore-src-$$ dst=wingtip-restore-dst-$$
dir=$(mktemp -d)
cleanup() { docker rm -f "$src" "$dst" > /dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
up() {
  docker run -d --name "$1" -e POSTGRES_USER=wingtip -e POSTGRES_PASSWORD=drill "$image" > /dev/null
  until docker exec "$1" pg_isready -U wingtip -q 2> /dev/null; do sleep 1; done
  sleep 2 # the image's first start restarts the server once its set-up is done
  until docker exec "$1" psql -U wingtip -d postgres -qc 'select 1' > /dev/null 2>&1; do sleep 1; done
}
up "$src"
docker exec "$src" psql -U wingtip -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE ROLE reader LOGIN" -c "CREATE DATABASE stack" > /dev/null
docker exec "$src" psql -U wingtip -d stack -v ON_ERROR_STOP=1 -q -c "
  CREATE TABLE pilots (id bigserial PRIMARY KEY, email text NOT NULL UNIQUE);
  INSERT INTO pilots (email) SELECT 'pilot' || n || '@example.com' FROM generate_series(1, 250) n;
  GRANT SELECT ON pilots TO reader;" > /dev/null
DB_CONTAINER=$src BACKUP_DIR=$dir scripts/dev/backup-db.sh
dump=$(ls "$dir"/db-*.sql.gz)
up "$dst"
gunzip -c "$dump" | docker exec -i "$dst" psql -U wingtip -d postgres -q -v ON_ERROR_STOP=0 > /dev/null 2>&1
rows=$(docker exec "$dst" psql -U wingtip -d stack -tAc 'SELECT count(*) FROM pilots')
role=$(docker exec "$dst" psql -U wingtip -d stack -tAc "SELECT has_table_privilege('reader', 'pilots', 'SELECT')")
if [ "$rows" != 250 ] || [ "$role" != t ]; then
  echo "::error title=Backup restore::the restored dump held $rows of 250 rows, the role's grant '$role'"
  exit 1
fi
echo "restored $(basename "$dump"): 250 rows and the role's grant, as dumped"
