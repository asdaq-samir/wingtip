#!/bin/bash
# The server's own checks, every five minutes (cron; deploy.sh writes the
# entry): what the health check through CloudFront cannot see, sent to
# CloudWatch as the stack's metrics (namespace Wingtip, dimension Stack),
# whose alarms (infra/cloudformation/template.yaml, "Alarms") email the
# owner. docs/RUNBOOKS.md says what to do about each.
#
# - RootDiskUsedPercent, DataDiskUsedPercent: the system disk (images,
#   swap, logs) and the data disk (Postgres, the FAA data, the chart
#   sheets), each alarmed at 85%.
# - ServicesNotHealthy: services compose should be running that are not,
#   and containers Docker calls unhealthy. Docker's restart policy restarts
#   a container that exits, never one that hangs while its health check
#   fails (a planner wedged on a lock answers nothing and stays up), so an
#   unhealthy one is restarted here, and counted.
# - OriginCertDaysLeft: the Let's Encrypt certificate Caddy shows
#   CloudFront for origin.<domain>, read off the server's own port 443.
#   Caddy renews it 30 days out; under 14 left means renewal is failing.
#   0 where it cannot be read (Caddy down), which the alarm also catches.
# - BackupAgeHours: since the last nightly backup that went whole to S3
#   (backup.sh writes the stamp), alarmed past 26 hours: a cron that never
#   ran sends no failure mail of its own.
# - ChecksRun: 1 each run. Its alarm treats no data as breaching, so a
#   server whose checks stopped (cron gone, the server wedged) is noticed.
#
#   infra/server/health.sh          check, restart what is unhealthy, report
#   DRY_RUN=1 infra/server/health.sh   print the metrics, restart and send nothing
#
# WINGTIP_CONF and WINGTIP_ROOT (/etc/wingtip.conf, /srv/wingtip) are for
# its test (scripts/ci/health_sh_test.sh), which runs it on stand-ins.
set -euo pipefail
root=${WINGTIP_ROOT:-/srv/wingtip}
# shellcheck source=/dev/null
source "${WINGTIP_CONF:-/etc/wingtip.conf}"
cd "$root/repo"
compose=(docker compose --env-file "$root/.env" -f infra/docker-compose.prod.yml)
# The stack's name, from its log group (/<stack>/server).
stack=${LOG_GROUP#/}
stack=${stack%%/*}
stamp=$root/backup-ok
now=$(date +%s)
say() { echo "$(date -u +%FT%TZ) health: $*"; }

used() { df --output=pcent "$1" | tail -1 | tr -dc 0-9; }
root_used=$(used /)
data_used=$(used "$root")

not_healthy=0
for id in $(docker ps -q --filter health=unhealthy); do
  name=$(docker inspect -f '{{.Name}}' "$id")
  not_healthy=$((not_healthy + 1))
  if [ "${DRY_RUN:-}" = 1 ]; then
    say "${name#/} is unhealthy"
  else
    say "${name#/} is unhealthy: restarting it"
    docker restart "$id" > /dev/null || say "${name#/} did not restart"
  fi
done
# compose's default services (the jobs' profile left out), less those running.
expected=$("${compose[@]}" config --services | sort)
running=$("${compose[@]}" ps --status running --services | sort)
for service in $(comm -23 <(echo "$expected") <(echo "$running")); do
  say "$service is not running"
  not_healthy=$((not_healthy + 1))
done

cert_days=0
if end=$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$ORIGIN_HOST" 2> /dev/null |
  openssl x509 -noout -enddate 2> /dev/null); then
  cert_days=$(( ($(date -d "${end#notAfter=}" +%s) - now) / 86400 ))
else
  say "the origin's certificate could not be read"
fi

# The clock starts at the first check, so a server whose backups never
# succeed alarms a day later rather than never.
[ -f "$stamp" ] || echo "$now" > "$stamp"
backup_hours=$(( (now - $(cat "$stamp")) / 3600 ))

metric() { printf '{"MetricName":"%s","Value":%s,"Unit":"%s","Dimensions":[{"Name":"Stack","Value":"%s"}]}' "$1" "$2" "$3" "$stack"; }
data="[$(metric RootDiskUsedPercent "$root_used" Percent),$(metric DataDiskUsedPercent "$data_used" Percent),$(metric ServicesNotHealthy "$not_healthy" Count),$(metric OriginCertDaysLeft "$cert_days" Count),$(metric BackupAgeHours "$backup_hours" Count),$(metric ChecksRun 1 Count)]"
say "disk ${root_used}% data ${data_used}% not healthy ${not_healthy} certificate ${cert_days} d backup ${backup_hours} h"
if [ "${DRY_RUN:-}" != 1 ]; then
  aws cloudwatch put-metric-data --region "$AWS_REGION" --namespace Wingtip --metric-data "$data"
fi
