#!/usr/bin/env bash
# infra/server/health.sh on stand-ins (ci.yml's infra job; the ops audit,
# 2026-11-21): docker, df, openssl and aws replaced by scripts that answer
# as a server with one unhealthy container, one service stopped, the disks
# at 42% and 91%, a certificate 20 days from its end and a backup 30 hours
# old. Checks that the unhealthy one is restarted, both counted, and every
# figure sent to CloudWatch as the alarms read it. Linux (GNU date), as the
# server is.
#
#   scripts/ci/health_sh_test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
here=$PWD
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/root/repo/infra"
ln -s "$here/infra/docker-compose.prod.yml" "$work/root/repo/infra/docker-compose.prod.yml"
cat > "$work/conf" <<CONF
AWS_REGION=us-east-1
LOG_GROUP=/wingtip/server
ORIGIN_HOST=origin.example.com
CONF
echo $(( $(date +%s) - 30 * 3600 )) > "$work/root/backup-ok"

cat > "$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
case "$*" in
  "ps -q --filter health=unhealthy") echo abc123 ;;
  "inspect -f {{.Name}} abc123") echo /wingtip-planner-1 ;;
  *"config --services") printf '%s\n' caddy db planner ingest weather gateway ;;
  *"ps --status running --services") printf '%s\n' caddy db planner weather gateway ;;
esac
STUB
cat > "$work/bin/df" <<'STUB'
#!/usr/bin/env bash
echo "Use%"
if [ "$2" = / ]; then echo " 42%"; else echo " 91%"; fi
STUB
cat > "$work/bin/openssl" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  s_client) echo "-----BEGIN CERTIFICATE-----" ;;
  x509) cat > /dev/null; echo "notAfter=$(date -u -d '+20 days +1 hour' '+%b %d %H:%M:%S %Y GMT')" ;;
esac
STUB
cat > "$work/bin/aws" <<'STUB'
#!/usr/bin/env bash
echo "$@" > "$SENT"
STUB
chmod +x "$work/bin/"*

CALLS=$work/calls SENT=$work/sent PATH="$work/bin:$PATH" WINGTIP_CONF=$work/conf WINGTIP_ROOT=$work/root \
  infra/server/health.sh > "$work/out"

fail() { echo "::error title=health.sh::$*"; cat "$work/out"; exit 1; }
grep -q "docker restart abc123" "$work/calls" || fail "the unhealthy container was not restarted"
grep -q "ingest is not running" "$work/out" || fail "the stopped service was not said"
sent=$(cat "$work/sent")
[[ "$sent" == *"--namespace Wingtip"* ]] || fail "not sent to the Wingtip namespace: $sent"
for want in '"RootDiskUsedPercent","Value":42' '"DataDiskUsedPercent","Value":91' '"ServicesNotHealthy","Value":2' \
  '"OriginCertDaysLeft","Value":20' '"BackupAgeHours","Value":30' '"ChecksRun","Value":1' '"Name":"Stack","Value":"wingtip"'; do
  [[ "$sent" == *"$want"* ]] || fail "missing $want in $sent"
done

# DRY_RUN restarts nothing and sends nothing.
rm -f "$work/sent" "$work/calls"
CALLS=$work/calls SENT=$work/sent PATH="$work/bin:$PATH" WINGTIP_CONF=$work/conf WINGTIP_ROOT=$work/root DRY_RUN=1 \
  infra/server/health.sh > "$work/out"
[ ! -e "$work/sent" ] || fail "DRY_RUN sent figures"
! grep -q "docker restart" "$work/calls" || fail "DRY_RUN restarted a container"
echo "health.sh: restarts the unhealthy, counts the stopped, sends every figure"
