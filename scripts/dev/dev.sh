#!/usr/bin/env bash
# The steps behind `make dev` (the Makefile at the repository's root), kept
# here so they can be read, shellchecked and run on their own:
#
#   scripts/dev/dev.sh doctor     check Docker, its memory, the ports and .env; change nothing but .env
#   scripts/dev/dev.sh up         doctor, then build the images, start the stack and wait until it is healthy
#
# Environment:
#   WINGTIP_MIN_DOCKER_GB   least memory Docker must have (default 8; the Python
#                           services and the first fetch of the FAA's data use
#                           about that much; the owner's VM has 12)
#   WINGTIP_WAIT_SECONDS    how long to wait for health (default 1500: the first
#                           start builds the images and downloads about a
#                           gigabyte of FAA data)
#   WINGTIP_SKIP_PORT_CHECK=1   do not look for something already on 8080 and 8025
#   COMPOSE_PROJECT_NAME    Compose's own override of the project name (the file
#                           says `name: wingtip`); the ports stay the file's, so a
#                           second stack needs the first one stopped
set -euo pipefail

cd "$(dirname "$0")/../.."
export PATH="$PATH:$HOME/.docker/bin"

min_gb=${WINGTIP_MIN_DOCKER_GB:-8}
wait_s=${WINGTIP_WAIT_SECONDS:-1500}
failed=0

say() { printf '%s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*" >&2; failed=1; }
ok() { printf 'ok    %s\n' "$*"; }
warn() { printf 'warn  %s\n' "$*"; }

doctor() {
  if ! command -v docker >/dev/null 2>&1; then
    bad "docker is not installed. Install Docker Desktop (https://docs.docker.com/get-docker/)."
    return
  fi
  if ! docker info >/dev/null 2>&1; then
    bad "Docker is installed but not running. Start Docker Desktop and wait for its whale to settle."
    return
  fi
  ok "Docker is running"

  if ! docker compose version >/dev/null 2>&1; then
    bad "Docker Compose v2 is missing (the 'docker compose' command). Update Docker Desktop."
    return
  fi
  ok "$(docker compose version --short 2>/dev/null | sed 's/^/Compose /')"

  # The VM's memory, in bytes, as Docker reports it; on Linux that is the host's.
  mem=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
  gb=$((mem / 1024 / 1024 / 1024))
  if [ "$mem" -le 0 ]; then
    warn "could not read Docker's memory; carrying on"
  elif [ "$gb" -lt "$min_gb" ]; then
    bad "Docker has ${gb} GB of memory and the stack wants ${min_gb} GB or more. Raise it in Docker Desktop, Settings, Resources (or set WINGTIP_MIN_DOCKER_GB to go on anyway)."
  else
    ok "Docker has ${gb} GB of memory"
  fi

  # Ports: ours are fine; anything else on them stops the gateway or the inbox.
  if [ "${WINGTIP_SKIP_PORT_CHECK:-0}" != 1 ] && command -v lsof >/dev/null 2>&1; then
    running=$(docker compose ps --status running --quiet 2>/dev/null | wc -l | tr -d ' ')
    if [ "${running:-0}" -eq 0 ]; then
      for port in 8080 8025; do
        if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
          bad "port $port is in use by another program; stop it first (lsof -nP -iTCP:$port -sTCP:LISTEN names it)."
        fi
      done
      if [ "$failed" -eq 0 ]; then ok "ports 8080 and 8025 are free"; fi
    else
      ok "the stack is already running (ports are its own)"
    fi
  fi

  if [ ! -f .env ]; then
    cp .env.example .env
    warn ".env was missing; made it from .env.example. Nothing in it is required."
    say "      The Claude features are off (docs/decisions/0035); .env.example says how to try them."
    say "      Add your address to APP_DEVELOPER_EMAILS for the developer role."
  else
    ok ".env is there"
  fi
  local_secrets
}

# This machine's own secrets, written into .env once and never shared: the
# planner's connector shows the gateway MCP_INTERNAL_TOKEN for a pilot's
# records, and a value committed to the repository would be every checkout's
# (the security audit's M2, 2026-11-10). Kept when .env already has one.
local_secrets() {
  if grep -Eq '^MCP_INTERNAL_TOKEN=.+' .env; then
    ok "MCP_INTERNAL_TOKEN is set"
    return
  fi
  token=$(openssl rand -hex 32 2>/dev/null || od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  if grep -Eq '^MCP_INTERNAL_TOKEN=' .env; then
    sed -i.bak -E "s/^MCP_INTERNAL_TOKEN=.*/MCP_INTERNAL_TOKEN=$token/" .env && rm -f .env.bak
  else
    printf '\n# The connector'"'"'s shared secret (docs/MCP-CONNECTOR.md), made by dev.sh.\nMCP_INTERNAL_TOKEN=%s\n' "$token" >>.env
  fi
  ok "MCP_INTERNAL_TOKEN written into .env (a random one, this machine's own)"
}

up() {
  doctor
  if [ "$failed" -ne 0 ]; then
    say "" >&2
    say "make dev stopped: fix the lines marked FAIL and run it again." >&2
    exit 1
  fi

  say ""
  say "Building the images (the first time takes a while)..."
  docker compose build

  say ""
  say "Starting the stack and waiting for it to be healthy (up to $((wait_s / 60)) minutes; the first start downloads the FAA's data)..."
  if ! docker compose up -d --wait --wait-timeout "$wait_s"; then
    say "" >&2
    say "The stack did not become healthy in time. What is running:" >&2
    docker compose ps >&2 || true
    say "Look at a service's log with: make logs s=<service>   (planner, gateway, ingest, weather, db)" >&2
    exit 1
  fi
  scripts/dev/pg-refresh-collation.sh

  say ""
  say "Wingtip Maps is up."
  say "  The app            http://localhost:8080/app"
  say "  Developer page     http://localhost:8080/app/dev"
  say "  API docs           http://localhost:8080/swagger-ui/index.html (gateway), http://localhost:8084/docs (planner)"
  say "  Sign-in inbox      http://localhost:8025  (Mailpit)"
  say ""
  say "To sign in: choose Sign in in the app and enter an address, then open the inbox and follow the link."
  say "developer@example.com also gets the developer role."
  say "Stop it with: make stop    Logs: make logs s=planner"
}

case "${1:-}" in
  doctor) doctor; exit "$failed" ;;
  up) up ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
