#!/usr/bin/env bash
# The toolchain's versions, from .tool-versions, the one source:
#
#   scripts/build/toolchain.sh              write every place that states one
#   scripts/build/toolchain.sh --check      fail where a place differs (CI's architecture job)
#   scripts/build/toolchain.sh get <name>   one version: java, python, rust, nodejs, xcode, ...
#
# The places and how each is held are scripts/build/toolchain.py's.
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/toolchain.py" "$@"
