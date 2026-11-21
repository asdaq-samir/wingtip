#!/bin/bash
# The nightly backup (cron, from the stack's UserData), to
# s3://SERVER_BUCKET/backups/<date>/; the bucket keeps 14 days.
# - postgres.dump: every pilot's account, aircraft and flights
#   (pg_dump, custom format).
# - labels.tar.gz: the checkpoint notes pilots have written,
#   and any chart ratings -- the planner keeps those as files in
#   data/labels, not in the database.
# - manifest.txt: each table's rows, counted just before the dump, and the
#   schema's Flyway version, which the restore drill checks a restore
#   against (scripts/ops/restore-drill.sh).
# And, beside the dated folders, backups/deleted-accounts.csv: the ids of
# the accounts deleted (deleted_accounts, V47), rewritten each night, so a
# restore of an older dump can delete them again (restore-deletions.sh).
#
# A whole night's backup stamps /srv/wingtip/backup-ok, whose age health.sh
# sends to CloudWatch: a backup that never ran is alarmed too.
#
# To restore (docs/RUNBOOKS.md, "Restore a backup", step by step;
# restore-deletions.sh save before and apply after):
#   aws s3 cp s3://$SERVER_BUCKET/backups/<date>/postgres.dump - | \
#     docker compose --env-file /srv/wingtip/.env -f infra/docker-compose.prod.yml \
#     exec -T db pg_restore -U wingtip -d wingtip --clean --if-exists
#   aws s3 cp s3://$SERVER_BUCKET/backups/<date>/labels.tar.gz - | tar -xz -C /srv/wingtip/data
set -euo pipefail
# shellcheck source=/dev/null
source /etc/wingtip.conf
cd /srv/wingtip/repo
# A failed or truncated dump must not replace a good day: dump to a file,
# check that pg_restore can read it, and only then upload. Any failure
# emails the owner (BACKUP_TOPIC_ARN, the stack's BudgetEmail), so a night
# without a backup is noticed before the 14 days are gone.
to="s3://$SERVER_BUCKET/backups/$(date -u +%F)"
file=$(mktemp /var/tmp/wingtip-XXXXXX.dump)
alert() {
  echo "backup failed: $(date -u +%FT%TZ)" >&2
  if [ -n "${BACKUP_TOPIC_ARN:-}" ]; then
    aws sns publish --region "$AWS_REGION" --topic-arn "$BACKUP_TOPIC_ARN" \
      --subject "Wingtip Maps: nightly backup failed" \
      --message "The database backup on $(hostname) failed at $(date -u +%FT%TZ). See /var/log/wingtip-backup.log." || true
  fi
}
trap 'rm -f "$file"' EXIT
trap alert ERR
compose=(docker compose --env-file /srv/wingtip/.env -f infra/docker-compose.prod.yml)
psql=("${compose[@]}" exec -T db psql -U wingtip -d wingtip -v ON_ERROR_STOP=1 -Atc)
# Counted just before the dump: a row written between the two is the only
# difference the drill allows (it fails a table that comes back empty or
# missing, not one a few rows off).
manifest=$(mktemp /var/tmp/wingtip-XXXXXX.txt)
trap 'rm -f "$file" "$manifest"' EXIT
{
  "${psql[@]}" "SELECT 'flyway ' || max(version::int) FROM flyway_schema_history WHERE success AND version IS NOT NULL"
  "${psql[@]}" "SELECT 'rows ' || table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
    FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
} > "$manifest"
"${compose[@]}" exec -T db pg_dump -U wingtip -d wingtip --format=custom > "$file"
"${compose[@]}" exec -T db pg_restore --list < "$file" > /dev/null
aws s3 cp "$file" "$to/postgres.dump" --region "$AWS_REGION" --only-show-errors
aws s3 cp "$manifest" "$to/manifest.txt" --region "$AWS_REGION" --only-show-errors
"${psql[@]}" \
  "COPY (SELECT pilot_id, deleted_at FROM deleted_accounts) TO STDOUT WITH CSV" |
  aws s3 cp - "s3://$SERVER_BUCKET/backups/deleted-accounts.csv" --region "$AWS_REGION" --only-show-errors
tar -cz -C /srv/wingtip/data labels | aws s3 cp - "$to/labels.tar.gz" --region "$AWS_REGION" --only-show-errors
# Whole: the stamp health.sh reads (on the data disk, so a new server keeps it).
date +%s > /srv/wingtip/backup-ok
