#!/usr/bin/env bash
# The engine for the Android app: wingtip-ffi built as a shared library for
# the three ABIs Google Play and the emulator want -- 64-bit ARM (every
# phone sold today), 32-bit ARM (the old ones Play still serves) and
# x86_64 (the emulator CI tests on) -- put where the app's Gradle build
# packs it (app/engine/jniLibs/<abi>/libwingtip_ffi.so), and the Kotlin
# uniffi-bindgen writes over it (app/engine/generated, package
# app.wingtipmaps.android.engine.ffi), which loads it through JNA. Both
# generated from the Rust's #[uniffi::export] functions each time, never
# edited. The twin of build-xcframework.sh for the iPhone.
# Needs rustup and the Android NDK .tool-versions names (android-ndk), the
# one the app's Gradle build (ndkVersion) strips the library with: found
# at ANDROID_NDK_HOME or ANDROID_NDK_LATEST_HOME when either is that version
# (GitHub's runner sets both, HOME to an older one), else in the SDK's
# ndk/<version> ($ANDROID_HOME, ~/Library/Android/sdk on a Mac,
# ~/Android/Sdk on Linux). The NDK's linker lays out every 64-bit library
# on 16 KB pages, as Google Play asks (scripts/ci/android_16k.py).
# Writes apps/android/app/engine/, which is not committed, with engine.hash,
# the engine it was built from.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
engine=$(cd "$here/../.." && pwd)
out="$engine/../apps/android/app/engine"
# rustup's cargo, where a shell that has not read ~/.cargo/env (an agent's,
# a launchd job's) has no Rust on its PATH.
command -v cargo >/dev/null || PATH=$PATH:$HOME/.cargo/bin
want=$("$engine/../scripts/build/toolchain.sh" get android-ndk)
ndk=""
for dir in "${ANDROID_NDK_HOME:-}" "${ANDROID_NDK_LATEST_HOME:-}"; do
  if [ -n "$dir" ] && [ "$(sed -n 's/^Pkg.Revision *= *//p' "$dir/source.properties" 2>/dev/null)" = "$want" ]; then
    ndk=$dir
    break
  fi
done
if [ -z "$ndk" ]; then
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -n "$sdk" ] && [ -d "$sdk/ndk/$want" ]; then
      ndk=$sdk/ndk/$want
      break
    fi
  done
fi
if [ -z "$ndk" ]; then
  echo "build-android.sh: no Android NDK $want (.tool-versions' android-ndk): install it with Android Studio's SDK Manager (SDK Tools, NDK (Side by side), Show Package Details) or \`sdkmanager \"ndk;$want\"\`" >&2
  exit 1
fi
echo "build-android.sh: using the NDK at $ndk" >&2
# Built once per engine on this Mac: a worktree whose engine another has
# built already copies it from the shared store (scripts/build/shared-cache.sh,
# docs/LOCAL-DEV.md); 53 s of three targets saved each time (2026-11-10).
# The NDK is .tool-versions', part of the store's key.
# shellcheck source=scripts/build/shared-cache.sh
. "$engine/../scripts/build/shared-cache.sh"
# The engine's hash written beside the libraries (engine_stamp), which
# go-live.sh holds to the checkout's engine.
if engine_store_restore android-engine "$out"; then engine_stamp "$out"; exit 0; fi
# The NDK's prebuilt clang for the machine building, and the API level
# the app's minSdk names (apps/android/app/build.gradle.kts): the engine is
# linked against the same Android libc the app runs on.
case "$(uname -s)" in
  Darwin) host=darwin-x86_64 ;;
  *) host=linux-x86_64 ;;
esac
bin="$ndk/toolchains/llvm/prebuilt/$host/bin"
api=26
# Rust's target, the ABI folder the app's build expects, and the clang's
# own name for the target (the 32-bit ARM one differs).
targets=(
  "aarch64-linux-android arm64-v8a aarch64-linux-android"
  "armv7-linux-androideabi armeabi-v7a armv7a-linux-androideabi"
  "x86_64-linux-android x86_64 x86_64-linux-android"
)
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
lib=libwingtip_ffi.so
rm -rf "$out"
for entry in "${targets[@]}"; do
  read -r target abi triple <<< "$entry"
  clang="$bin/${triple}${api}-clang"
  # Cargo's and the cc crate's names for the target's tools, each with the
  # target's dashes made underscores.
  under=${target//-/_}
  export "CARGO_TARGET_$(echo "$under" | tr '[:lower:]' '[:upper:]')_LINKER=$clang"
  export "CC_$under=$clang"
  export "AR_$under=$bin/llvm-ar"
  cargo rustc --release --manifest-path "$engine/Cargo.toml" -p wingtip-ffi --lib --crate-type cdylib --target "$target"
  mkdir -p "$out/jniLibs/$abi"
  cp "$engine/target/$target/release/$lib" "$out/jniLibs/$abi/$lib"
done
# The Kotlin read from the phone's library itself (library mode), with no
# formatter run over it, so the same library always writes the same Kotlin;
# in a generated folder, which ktlint and detekt pass over.
(cd "$engine" && cargo run -p wingtip-ffi-bindgen -- generate --no-format \
  --library "$out/jniLibs/arm64-v8a/$lib" --language kotlin --out-dir "$out/generated")
engine_stamp "$out"
engine_store_publish android-engine "$out"
echo "built $out"
