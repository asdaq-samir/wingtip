#!/usr/bin/env bash
# The MSFS replay agent's checks, as ci.yml's test-sim job and
# scripts/dev/check.sh's sim area both run them: built (without the SDK's
# SimConnect, which only the trial's instance has), its format checked and
# its unit tests run, in .NET's own SDK image at .tool-versions' version
# (Docker is the runner's and the Mac's alike).
set -euo pipefail
cd "$(dirname "$0")/../.."
dotnet=$(scripts/build/toolchain.sh get dotnet)
# tools/ whole, as Replay.Core embeds the shot list's schema from beside
# the X-Plane plugin (tools/xplane-driver/wingtip_replay/shots.schema.json).
docker run --rm -v "$PWD/tools:/src" -v wingtip-nuget:/root/.nuget/packages -w /src/msfs-agent \
  -e DOTNET_CLI_TELEMETRY_OPTOUT=1 -e DOTNET_NOLOGO=1 "mcr.microsoft.com/dotnet/sdk:$dotnet" \
  sh -c 'dotnet build MsfsAgent.slnx -v q && dotnet format MsfsAgent.slnx --verify-no-changes && dotnet test --solution MsfsAgent.slnx --no-build'
