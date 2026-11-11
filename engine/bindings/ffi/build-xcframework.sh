#!/usr/bin/env bash
# The engine for the iOS app: wingtip-ffi built for the iPhone and for the
# simulator on both Apple silicon and Intel Macs, put in one XCFramework
# with its C header and module map, so Swift can `import WingtipEngine`.
# Run on a Mac with Xcode and rustup (GitHub's macOS runner, native-ios.yml);
# writes apps/ios/Frameworks/WingtipEngine.xcframework, which is not committed.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
engine=$(cd "$here/../.." && pwd)
out="$engine/../apps/ios/Frameworks/WingtipEngine.xcframework"
# rustup's cargo, where a shell that has not read ~/.cargo/env (an agent's,
# a launchd job's) has no Rust on its PATH.
command -v cargo >/dev/null || PATH=$PATH:$HOME/.cargo/bin
# Built once per engine on this Mac: a worktree whose engine another has
# built already copies it from the shared store (scripts/build/shared-cache.sh,
# docs/LOCAL-DEV.md); 53 s of three targets saved each time (2026-11-10).
# shellcheck source=scripts/build/shared-cache.sh
. "$engine/../scripts/build/shared-cache.sh"
if engine_store_restore ios-xcframework "$out"; then exit 0; fi
targets=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)
rustup target add "${targets[@]}"
for target in "${targets[@]}"; do
  cargo build --release --manifest-path "$engine/Cargo.toml" -p wingtip-ffi --target "$target"
done
lib=libwingtip_ffi.a
sim="$engine/target/ios-simulator"
mkdir -p "$sim"
lipo -create "$engine/target/aarch64-apple-ios-sim/release/$lib" "$engine/target/x86_64-apple-ios/release/$lib" -output "$sim/$lib"
rm -rf "$out"
xcodebuild -create-xcframework \
  -library "$engine/target/aarch64-apple-ios/release/$lib" -headers "$here/include" \
  -library "$sim/$lib" -headers "$here/include" \
  -output "$out"
engine_store_publish ios-xcframework "$out"
echo "built $out"
