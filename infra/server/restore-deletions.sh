#!/bin/bash
# An account deleted stays deleted after a restore (docs/README-AWS.md,
# "Backups and restore"). A backup is kept up to 44 days, so one made before
# a deletion brings that pilot back. The gateway notes each deletion by id
# in deleted_accounts (V47) and deletes again, as it starts, any noted id
# whose account is back (DeletionsReapplied). But the restore replaces that
# table with the backup's older copy, so the list is saved before and put
# back after:
#
#   infra/server/restore-deletions.sh save    # before pg_restore
#   ... pg_restore, as README-AWS says ...
#   infra/server/restore-deletions.sh apply   # after it, then restart the gateway
#
# save takes the live database's list, if it still answers, and the copy
# the newest nightly backup left beside the dumps (backup.sh); apply puts
# every id back and moves the pilots' id sequence past them, so no new
# sign-up is given a deleted pilot's id.
set -euo pipefail
# shellcheck source=/dev/null
source /etc/wingtip.conf
cd /srv/wingtip/repo
list=/var/tmp/wingtip-deleted-accounts.csv
compose=(docker compose --env-file /srv/wingtip/.env -f infra/docker-compose.prod.yml)
psql=("${compose[@]}" exec -T db psql -U wingtip -d wingtip -v ON_ERROR_STOP=1)

case "${1:-}" in
  save)
    : > "$list"
    "${psql[@]}" -Atc "COPY (SELECT pilot_id, deleted_at FROM deleted_accounts) TO STDOUT WITH CSV" >> "$list" \
      || echo "the live database did not answer; the nightly copy alone" >&2
    aws s3 cp "s3://$SERVER_BUCKET/backups/deleted-accounts.csv" - --region "$AWS_REGION" >> "$list" \
      || echo "no nightly copy of the deletions in the bucket" >&2
    echo "$(sort -u "$list" | grep -c . || true) deletions saved to $list"
    ;;
  apply)
    [ -f "$list" ] || { echo "nothing saved: run '$0 save' before the restore" >&2; exit 1; }
    {
      echo "CREATE TEMP TABLE saved (pilot_id BIGINT, deleted_at TIMESTAMPTZ);"
      echo "COPY saved FROM STDIN WITH CSV;"
      sort -u "$list"
      echo '\.'
      echo "INSERT INTO deleted_accounts SELECT pilot_id, min(deleted_at) FROM saved GROUP BY pilot_id ON CONFLICT DO NOTHING;"
      echo "SELECT setval(pg_get_serial_sequence('pilots', 'id'),"
      echo "  GREATEST((SELECT max(id) FROM pilots), (SELECT max(pilot_id) FROM deleted_accounts), 1));"
    } | "${psql[@]}"
    echo "deletions put back; restart the gateway, which deletes those accounts again as it starts"
    ;;
  *)
    echo "usage: $0 save|apply" >&2
    exit 2
    ;;
esac
