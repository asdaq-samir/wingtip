#!/usr/bin/env bash
# The week's newer-versions issue (.github/workflows/versions.yml): npm's
# and Maven's own reports first, then scripts/ci/newest_versions.py reads
# them with the registries it asks itself. Pass --dry-run to print the
# issue's body and write nothing. Needs node, mvn (or none: that part is
# then left out) and gh.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=${RUNNER_TEMP:-$(mktemp -d)}

# From the lockfile alone, no install. npm outdated exits 1 when anything
# is outdated, which is the report, not a failure.
(cd apps/web && npm outdated --json --package-lock-only > "$out/npm.json") || [ $? -eq 1 ]

# The parent (Spring Boot), the pom's own dependencies and its plugins;
# not every library Spring Boot's BOM manages.
if command -v mvn > /dev/null; then
  (cd services/gateway && mvn -B versions:display-parent-updates versions:display-dependency-updates \
    versions:display-plugin-updates -DprocessDependencyManagement=false \
    "-Dmaven.version.ignore=(?i).*-(alpha|beta|rc|m|cr|snapshot).*") > "$out/mvn.txt"
fi

exec python3 scripts/ci/newest_versions.py --npm "$out/npm.json" --maven "$out/mvn.txt" "$@"
