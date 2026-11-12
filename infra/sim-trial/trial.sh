#!/usr/bin/env bash
# The MSFS 2024 trial on AWS, from the Mac (infra/sim-trial/README.md):
#
#   trial.sh up [--email you@x] [--type g6e.2xlarge] [--hours 4] [--windows 2025|2022]
#   trial.sh status                 the instance, its setup log, the runs
#   trial.sh dcv                    the DCV address and the passwords
#   trial.sh run [--track f.json] [--resolution 1440p|4k|both] [--shots chase:45,...]
#   trial.sh fetch [dir]            download the runs (default ./sim-trial-out)
#   trial.sh down                   stop the instance (the disk is kept, about $1.70 a day)
#   trial.sh destroy                delete everything: instance, disk, bucket, budget
#
# The AWS CLI v2 with a profile (AWS_PROFILE) and region (AWS_REGION,
# us-east-1 where unset). Nothing here signs in to anything or spends
# before `up`; `up` starts the meter, `down` and `destroy` stop it.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
stack=wingtip-sim-trial
schedule=wingtip-sim-trial-stop
export AWS_REGION=${AWS_REGION:-us-east-1} AWS_PAGER=""

die() { echo "trial: $*" >&2; exit 1; }
say() { echo "trial: $*" >&2; }
need() { command -v "$1" >/dev/null || die "$1 is not installed ($2)"; }
need aws "brew install awscli, then aws configure sso or aws configure --profile <name>"

output() {
  aws cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null
}
param() {
  aws cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text 2>/dev/null
}
instance() { output InstanceId; }
bucket() { output Bucket; }
have_stack() { aws cloudformation describe-stacks --stack-name "$stack" >/dev/null 2>&1; }

# Windows on-demand prices in us-east-1, $/h, from AWS's price list of
# 2026-11-10 (Windows licence included); elsewhere, see the EC2 pricing page.
price() {
  case "$1" in
    g6e.xlarge) echo 2.045 ;;
    g6e.2xlarge) echo 2.61 ;;
    g6.2xlarge) echo 1.35 ;;
    *) echo "?" ;;
  esac
}

# The one-time stop, EventBridge Scheduler calling EC2 StopInstances.
set_stop() {
  local hours=$1 at
  at=$(date -u -v+"${hours}"H +%Y-%m-%dT%H:%M:%S)
  aws scheduler delete-schedule --name "$schedule" >/dev/null 2>&1 || true
  aws scheduler create-schedule --name "$schedule" \
    --schedule-expression "at($at)" --schedule-expression-timezone UTC \
    --flexible-time-window Mode=OFF --action-after-completion DELETE \
    --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ec2:stopInstances\",\"RoleArn\":\"$(output StopScheduleRoleArn)\",\"Input\":\"{\\\"InstanceIds\\\":[\\\"$(instance)\\\"]}\"}" >/dev/null
  say "the instance stops by itself at $at UTC ($hours h), and after 45 idle minutes"
}

cmd_up() {
  local email="" type=g6e.2xlarge hours=4 windows=2025
  while [ $# -gt 0 ]; do
    case "$1" in
      --email) email=$2; shift 2 ;;
      --type) type=$2; shift 2 ;;
      --hours) hours=$2; shift 2 ;;
      --windows) windows=$2; shift 2 ;;
      *) die "up: what is $1?" ;;
    esac
  done
  aws sts get-caller-identity --query Account --output text >/dev/null || die "no AWS credentials: aws configure sso, then export AWS_PROFILE"
  if [ -z "$email" ] && have_stack; then email=$(param BudgetEmail); fi
  [ -n "$email" ] || die "up: --email you@example.com (the budget's warnings go there)"

  # The GPU quota is in vCPUs, and new accounts have 0 (README step 2).
  local vcpus quota
  vcpus=$(aws ec2 describe-instance-types --instance-types "$type" --query 'InstanceTypes[0].VCpuInfo.DefaultVCpus' --output text)
  quota=$(aws service-quotas get-service-quota --service-code ec2 --quota-code L-DB2E81BA --query 'Quota.Value' --output text 2>/dev/null || echo 0)
  [ "${quota%.*}" -ge "$vcpus" ] || die "the quota \"Running On-Demand G and VT instances\" is $quota vCPUs in $AWS_REGION; $type needs $vcpus (README step 2)"

  local vpc zones subnet="" zone ip
  vpc=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
  [ "$vpc" != None ] || die "no default VPC in $AWS_REGION: aws ec2 create-default-vpc"
  zones=$(aws ec2 describe-instance-type-offerings --location-type availability-zone \
    --filters Name=instance-type,Values="$type" --query 'InstanceTypeOfferings[].Location' --output text)
  for zone in $zones; do
    subnet=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$vpc" Name=availability-zone,Values="$zone" Name=default-for-az,Values=true \
      --query 'Subnets[0].SubnetId' --output text)
    [ "$subnet" != None ] && break
  done
  [ -n "$subnet" ] && [ "$subnet" != None ] || die "no default subnet in a zone that has $type"
  ip=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')

  say "deploying $stack: $type (\$$(price "$type")/h), Windows Server $windows, $zone, DCV from $ip"
  aws cloudformation deploy --stack-name "$stack" --template-file "$here/template.yaml" --capabilities CAPABILITY_IAM \
    --parameter-overrides InstanceType="$type" VpcId="$vpc" SubnetId="$subnet" OwnerCidr="$ip/32" BudgetEmail="$email" \
    ImageId="/aws/service/ami-windows-latest/Windows_Server-$windows-English-Full-Base"
  local id state
  id=$(instance)
  state=$(aws ec2 describe-instances --instance-ids "$id" --query 'Reservations[0].Instances[0].State.Name' --output text)
  if [ "$state" = stopped ]; then aws ec2 start-instances --instance-ids "$id" >/dev/null; fi
  aws ec2 wait instance-running --instance-ids "$id"
  set_stop "$hours"
  say "up. The first boot installs the driver, DCV, OBS, Steam and .NET and restarts: about 20 minutes (trial.sh status)."
  cmd_status
}

cmd_status() {
  have_stack || die "no trial is up (trial.sh up)"
  local id
  id=$(instance)
  aws ec2 describe-instances --instance-ids "$id" \
    --query 'Reservations[0].Instances[0].{state:State.Name,type:InstanceType,ip:PublicIpAddress,since:LaunchTime}' --output table
  aws scheduler get-schedule --name "$schedule" --query ScheduleExpression --output text 2>/dev/null | sed 's/^/stop scheduled: /' || echo "no stop scheduled"
  echo "--- setup log (last lines)"
  aws s3 cp "s3://$(bucket)/setup/setup.log" - 2>/dev/null | tail -15 || echo "(not written yet: the first boot takes a few minutes)"
  echo "--- runs"
  aws s3 ls "s3://$(bucket)/runs/" 2>/dev/null || echo "(none yet)"
}

cmd_dcv() {
  local ip
  ip=$(aws ec2 describe-instances --instance-ids "$(instance)" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  [ "$ip" != None ] || die "the instance is not running (trial.sh up)"
  secret() { aws ssm get-parameter --name "/wingtip/sim-trial/$1" --with-decryption --query Parameter.Value --output text; }
  cat <<EOF
DCV:       $ip:8443  (the DCV client, or https://$ip:8443 in a browser; the certificate is self-signed)
user:      Administrator
password:  $(secret admin-password)
OBS:       Tools > WebSocket Server Settings, port 4455, password $(secret obs-password)
EOF
}

cmd_run() {
  local track="$repo/tools/msfs-agent/fixtures/n901tq-2026-11-11-sedona.json" res=1440p shots=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --track) track=$2; shift 2 ;;
      --resolution) res=$2; shift 2 ;;
      --shots) shots=$2; shift 2 ;;
      *) die "run: what is $1?" ;;
    esac
  done
  [ -f "$track" ] || die "run: no track at $track"
  local b id
  b=$(bucket)
  id=$(instance)
  say "the kit to s3://$b/kit/"
  aws s3 sync "$repo/tools/msfs-agent" "s3://$b/kit/msfs-agent" --delete --exclude '*/bin/*' --exclude '*/obj/*' --only-show-errors
  aws s3 cp "$track" "s3://$b/kit/track.json" --only-show-errors
  aws s3 cp "$here/run-replay.ps1" "s3://$b/kit/run-replay.ps1" --only-show-errors
  local r
  for r in $([ "$res" = both ] && echo "4k 1440p" || echo "$res"); do
    local run cmd params command_id status
    run=$(date -u +%Y%m%dT%H%M%SZ)-$r
    cmd="Read-S3Object -BucketName $b -Key kit/run-replay.ps1 -File C:\\wingtip\\run-replay.ps1 -Region $AWS_REGION | Out-Null; & C:\\wingtip\\run-replay.ps1 -Bucket $b -Run $run -Region $AWS_REGION -Resolution $r -Shots '$shots'; exit \$LASTEXITCODE"
    params=$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]], "executionTimeout": ["7200"]}))' "$cmd")
    command_id=$(aws ssm send-command --instance-ids "$id" --document-name AWS-RunPowerShellScript \
      --comment "Wingtip replay $run" --parameters "$params" --timeout-seconds 600 \
      --output-s3-bucket-name "$b" --output-s3-key-prefix "ssm/$run" --query Command.CommandId --output text)
    say "run $run sent ($command_id); the flight replays in real time, about 20 minutes"
    local deadline=$(( $(date +%s) + 7500 ))
    while :; do
      status=$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$id" --query Status --output text 2>/dev/null || echo Pending)
      case "$status" in Pending|InProgress|Delayed) ;; *) break ;; esac
      [ "$(date +%s)" -lt "$deadline" ] || { say "still $status after 2 hours; see trial.sh status"; break; }
      sleep 30
    done
    say "run $run: $status"
    aws s3 ls "s3://$b/runs/$run/" || true
  done
  say "trial.sh fetch to download them"
}

cmd_fetch() {
  local dir=${1:-$PWD/sim-trial-out}
  aws s3 sync "s3://$(bucket)/runs" "$dir/runs" --only-show-errors
  aws s3 sync "s3://$(bucket)/setup" "$dir/setup" --only-show-errors
  say "in $dir"
}

cmd_down() {
  aws scheduler delete-schedule --name "$schedule" >/dev/null 2>&1 || true
  aws ec2 stop-instances --instance-ids "$(instance)" >/dev/null
  aws ec2 wait instance-stopped --instance-ids "$(instance)"
  say "stopped. The 250 GB disk is kept for the next up (about \$1.70 a day); trial.sh destroy deletes it"
}

cmd_destroy() {
  have_stack || die "no trial to destroy"
  local answer
  read -r -p "Delete the instance, its disk (MSFS 2024 and all), the bucket and its recordings, and the budget? Type destroy: " answer
  [ "$answer" = destroy ] || die "kept"
  aws scheduler delete-schedule --name "$schedule" >/dev/null 2>&1 || true
  aws s3 rm "s3://$(bucket)" --recursive --only-show-errors
  aws cloudformation delete-stack --stack-name "$stack"
  aws cloudformation wait stack-delete-complete --stack-name "$stack"
  aws ssm delete-parameters --names /wingtip/sim-trial/admin-password /wingtip/sim-trial/obs-password >/dev/null 2>&1 || true
  say "everything is deleted; nothing of the trial is billed from now"
}

case "${1:-}" in
  up|status|dcv|run|fetch|down|destroy) c=$1; shift; "cmd_$c" "$@" ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 64 ;;
esac
