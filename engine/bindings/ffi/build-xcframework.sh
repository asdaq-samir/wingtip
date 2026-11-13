#!/usr/bin/env bash
# The engine for the iOS app: wingtip-ffi built for the iPhone and for the
# simulator on both Apple silicon and Intel Macs, put in one XCFramework
# with the C header and module map uniffi-bindgen writes (the module
# WingtipEngineFFI), and the Swift it writes over them
# (Generated/WingtipEngine.swift, the app's `import WingtipEngine`, a
# static framework target of apps/ios/project.yml). Generated from the library each time, never
# edited: the Rust's #[uniffi::export] functions are the one source.
# Run on a Mac with Xcode and rustup (GitHub's macOS runner, native-ios.yml);
# writes apps/ios/Frameworks/WingtipEngine/, which is not committed.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
engine=$(cd "$here/../.." && pwd)
out="$engine/../apps/ios/Frameworks/WingtipEngine"
# rustup's cargo, where a shell that has not read ~/.cargo/env (an agent's,
# a launchd job's) has no Rust on its PATH.
command -v cargo >/dev/null || PATH=$PATH:$HOME/.cargo/bin
# Built once per engine on this Mac: a worktree whose engine another has
# built already copies it from the shared store (scripts/build/shared-cache.sh,
# docs/LOCAL-DEV.md); 53 s of three targets saved each time (2026-11-10).
# shellcheck source=scripts/build/shared-cache.sh
. "$engine/../scripts/build/shared-cache.sh"
if engine_store_restore ios-engine "$out"; then exit 0; fi
targets=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)
rustup target add "${targets[@]}"
for target in "${targets[@]}"; do
  cargo rustc --release --manifest-path "$engine/Cargo.toml" -p wingtip-ffi --lib --crate-type staticlib --target "$target"
done
lib=libwingtip_ffi.a
gen="$engine/target/uniffi-swift"
rm -rf "$gen"
# The bindings read from the iPhone's library itself (library mode), with
# no formatter run over them, so the same library always writes the same
# Swift.
(cd "$engine" && cargo run -p wingtip-ffi-bindgen -- generate --no-format \
  --library "$engine/target/aarch64-apple-ios/release/$lib" --language swift --out-dir "$gen")
mkdir -p "$gen/include"
cp "$gen/WingtipEngineFFI.h" "$gen/include/"
cp "$gen/WingtipEngineFFI.modulemap" "$gen/include/module.modulemap"
sim="$engine/target/ios-simulator"
mkdir -p "$sim"
lipo -create "$engine/target/aarch64-apple-ios-sim/release/$lib" "$engine/target/x86_64-apple-ios/release/$lib" -output "$sim/$lib"
rm -rf "$out"
mkdir -p "$out"
xcodebuild -create-xcframework \
  -library "$engine/target/aarch64-apple-ios/release/$lib" -headers "$gen/include" \
  -library "$sim/$lib" -headers "$gen/include" \
  -output "$out/WingtipEngineFFI.xcframework"
# In a Generated folder, which the Swift formatter and linters pass over.
mkdir -p "$out/Generated"
cp "$gen/WingtipEngine.swift" "$out/Generated/WingtipEngine.swift"
engine_store_publish ios-engine "$out"
echo "built $out"
