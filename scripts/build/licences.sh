#!/usr/bin/env bash
# The open-source notices the apps ship (docs/legal/credits.md, "Open-source
# licences"), each written by its ecosystem's own stock tool from the
# dependencies' own metadata and licence files:
#
#   scripts/build/licences.sh engine [--check]
#       engine/licences/NOTICES.txt, the engine's Rust crates (cargo-about),
#       and Android's copy of it as an AboutLibraries licence
#       (apps/android/app/aboutlibraries/licenses/wingtip-engine.json).
#       Fails on a crate under a licence engine/about.toml does not accept.
#   scripts/build/licences.sh ios [--check] <SourcePackages>
#       apps/ios/Wingtip/Settings.bundle's acknowledgements (LicensePlist),
#       from the Swift packages' checkouts in a build's SourcePackages
#       folder, offline, with the engine's and the NOTICE files kept in
#       apps/ios/license_plist.yml.
#
# --check writes nothing and fails where the committed files differ from
# what the tool writes now (the guards' "Engine: licences", the iPhone's CI
# job). The web's notices are its build's (npm run licences,
# license-checker) and Android's its Gradle build's (AboutLibraries), each
# failing there on a licence that may not ship.
#
# Each tool is a release binary at the version .tool-versions pins, checked
# against the sums below and kept in the cache, as tool.sh keeps mise.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
cache=${XDG_CACHE_HOME:-$HOME/.cache}/wingtip-tools
version() { "$here/scripts/build/toolchain.sh" get "$1"; }
sha256() { if command -v shasum > /dev/null; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }

# cargo-about's release sums (github.com/EmbarkStudios/cargo-about, its
# .sha256 files), for the hosts the guards run on.
CARGO_ABOUT_SUMS="0.9.3 aarch64-apple-darwin:45520df8680978a6e7c4023ace0e3f311c73efc208cd68e5a7f4ed4822fa0349 x86_64-unknown-linux-musl:3ad1e94ea1e63d69d1961f4fb15ccbbe9575d906111f96d2cb4dce6df48f71b4 aarch64-unknown-linux-musl:eb4d9ff6ebd2518152a8308729431a04b3836e71d2bd5ead7aea69f91a71162e"
# LicensePlist's portable release (github.com/mono0926/LicensePlist), macOS only.
LICENSE_PLIST_SUM="3.28.3 dd3ca6c08981a1e0c4980d5bc857bbd40f17b8b4c7ca89ab8923396fd910a040"

# NAME VERSION PINNED URL SUM: the archive at URL, unpacked once into the
# cache, its sum checked; prints the folder.
fetch() {
  local name=$1 want=$2 pinned=$3 url=$4 sum=$5 dir tmp
  [ "$want" = "$pinned" ] || { echo "licences.sh: .tool-versions has $name $want, this script's sums are for $pinned" >&2; return 1; }
  dir=$cache/$name-$want
  if [ ! -d "$dir" ]; then
    tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/archive" "$url"
    if [ "$(sha256 "$tmp/archive")" != "$sum" ]; then
      echo "licences.sh: $name $want's download is not the pinned sum; not used" >&2
      rm -rf "$tmp"
      return 1
    fi
    mkdir -p "$tmp/out"
    case $url in
      *.zip) unzip -q "$tmp/archive" -d "$tmp/out" ;;
      *) tar xzf "$tmp/archive" -C "$tmp/out" ;;
    esac
    mkdir -p "$cache"
    mv "$tmp/out" "$dir"
    rm -rf "$tmp"
  fi
  echo "$dir"
}

cargo_about() {
  local want triple sum dir
  want=$(version cargo-about)
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) triple=aarch64-apple-darwin ;;
    Linux-x86_64) triple=x86_64-unknown-linux-musl ;;
    Linux-aarch64) triple=aarch64-unknown-linux-musl ;;
    *) echo "licences.sh: no cargo-about release for $(uname -sm)" >&2; return 3 ;;
  esac
  sum=$(printf '%s\n' "${CARGO_ABOUT_SUMS#* }" | tr ' ' '\n' | sed -n "s/^$triple://p")
  dir=$(fetch cargo-about "$want" "${CARGO_ABOUT_SUMS%% *}" \
    "https://github.com/EmbarkStudios/cargo-about/releases/download/$want/cargo-about-$want-$triple.tar.gz" "$sum")
  echo "$dir/cargo-about-$want-$triple/cargo-about"
}

license_plist() {
  local want dir
  want=$(version license-plist)
  [ "$(uname -s)" = Darwin ] || { echo "licences.sh: LicensePlist runs on macOS only" >&2; return 3; }
  dir=$(fetch license-plist "$want" "${LICENSE_PLIST_SUM%% *}" \
    "https://github.com/mono0926/LicensePlist/releases/download/$want/portable_licenseplist.zip" "${LICENSE_PLIST_SUM#* }")
  echo "$dir/license-plist"
}

# WANT HAVE: in --check, fail where they differ; else HAVE takes WANT's place.
settle() {
  local want=$1 have=$2
  if [ -n "$check" ]; then
    diff -r -q "$want" "$have" > /dev/null || {
      echo "licences.sh: $have is not what the tool writes now; run scripts/build/licences.sh $area and commit it" >&2
      diff -r "$want" "$have" | head -40 >&2
      return 1
    }
  elif [ -d "$want" ]; then
    rm -rf "$have" && cp -R "$want" "$have"
  else
    cp "$want" "$have"
  fi
}

area=${1:?usage: licences.sh engine|ios [--check] [SourcePackages]}
shift
check=""
[ "${1:-}" = --check ] && { check=1; shift; }
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

case $area in
  engine)
    tool=$(cargo_about)
    # The crates' sources, where their licence files are; then read
    # offline, so the answer is the same on every machine.
    cargo fetch --locked --manifest-path "$here/engine/Cargo.toml" > /dev/null
    "$tool" generate --frozen --fail --workspace -m "$here/engine/Cargo.toml" -c "$here/engine/about.toml" \
      "$here/engine/licences/about.hbs" -o "$out/NOTICES.txt"
    # Android's About lists every library through AboutLibraries; the
    # engine, linked in through JNA, is one more, its licence these notices.
    python3 - "$out/NOTICES.txt" "$out/wingtip-engine.json" << 'EOF'
import json, sys
text = open(sys.argv[1], encoding="utf-8").read()
licence = {
    "name": "The engine's Rust crates",
    "hash": "wingtip-engine",
    "url": "https://github.com/asdaq-samir/wingtip/blob/main/engine/licences/NOTICES.txt",
    "content": text,
}
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(licence, f, indent=2, ensure_ascii=False)
    f.write("\n")
EOF
    settle "$out/NOTICES.txt" "$here/engine/licences/NOTICES.txt"
    settle "$out/wingtip-engine.json" "$here/apps/android/app/aboutlibraries/licenses/wingtip-engine.json"
    ;;
  ios)
    sources=${1:?usage: licences.sh ios [--check] <SourcePackages folder of a build>}
    tool=$(license_plist)
    project=$here/apps/ios/Wingtip.xcodeproj
    [ -d "$project" ] || { echo "licences.sh: no $project; run xcodegen in apps/ios first" >&2; exit 1; }
    # The NOTICE files license_plist.yml carries, still the checkouts' own.
    for notice in "$here"/apps/ios/Licences/*-NOTICE.txt; do
      package=$(basename "$notice" -NOTICE.txt)
      [ -f "$sources/checkouts/$package/NOTICE.txt" ] || { echo "licences.sh: $package has no NOTICE.txt in $sources" >&2; exit 1; }
      settle "$sources/checkouts/$package/NOTICE.txt" "$notice"
    done
    (cd "$here/apps/ios" && "$tool" --config-path license_plist.yml --xcodeproj-path "$project" \
      --package-sources-path "$sources" --sandbox-mode --force --fail-if-missing-license \
      --suppress-opening-directory --no-color --silence-mode --output-path "$out/bundle")
    mkdir -p "$out/acknowledgements"
    cp -R "$out/bundle/com.mono0926.LicensePlist.plist" "$out/bundle/com.mono0926.LicensePlist" "$out/acknowledgements/"
    bundle=$here/apps/ios/Wingtip/Settings.bundle
    settle "$out/acknowledgements/com.mono0926.LicensePlist.plist" "$bundle/com.mono0926.LicensePlist.plist"
    settle "$out/acknowledgements/com.mono0926.LicensePlist" "$bundle/com.mono0926.LicensePlist"
    ;;
  *)
    echo "licences.sh: no area $area (engine, ios)" >&2
    exit 2
    ;;
esac
