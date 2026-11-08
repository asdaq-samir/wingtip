#!/usr/bin/env bash
# The engine for the Android app: wingtip-ffi built as a static library for
# the three ABIs Google Play and the emulator want -- 64-bit ARM (every
# phone sold today), 32-bit ARM (the old ones Play still serves) and
# x86_64 (the emulator CI tests on) -- and put where the app's CMake build
# (apps/android/app/src/main/cpp/CMakeLists.txt) links it into the JNI shim,
# with its C header. The twin of build-xcframework.sh for the iPhone.
# Needs rustup and an Android NDK: ANDROID_NDK_HOME, or the
# ANDROID_NDK_LATEST_HOME GitHub's runner sets (native-android.yml), or else
# the newest NDK in the SDK ($ANDROID_HOME/ndk, ~/Library/Android/sdk/ndk on
# a Mac, ~/Android/Sdk/ndk on Linux), named as it is picked.
# Writes apps/android/app/engine/, which is not committed.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
engine=$(cd "$here/../.." && pwd)
out="$engine/../apps/android/app/engine"
# rustup's cargo, where a shell that has not read ~/.cargo/env (an agent's,
# a launchd job's) has no Rust on its PATH.
command -v cargo >/dev/null || PATH=$PATH:$HOME/.cargo/bin
ndk="${ANDROID_NDK_HOME:-${ANDROID_NDK_LATEST_HOME:-}}"
if [ -z "$ndk" ]; then
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [ -n "$sdk" ] && [ -d "$sdk/ndk" ] || continue
    ndk=$(find "$sdk/ndk" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)
    [ -n "$ndk" ] && break
  done
  if [ -z "$ndk" ]; then
    echo "build-android.sh: no Android NDK: set ANDROID_NDK_HOME, or install one with Android Studio's SDK Manager (SDK Tools, NDK)" >&2
    exit 1
  fi
  echo "build-android.sh: using the NDK at $ndk (ANDROID_NDK_HOME is unset)" >&2
fi
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
lib=libwingtip_ffi.a
for entry in "${targets[@]}"; do
  read -r target abi triple <<< "$entry"
  clang="$bin/${triple}${api}-clang"
  # Cargo's and the cc crate's names for the target's tools, each with the
  # target's dashes made underscores.
  under=${target//-/_}
  export "CARGO_TARGET_$(echo "$under" | tr '[:lower:]' '[:upper:]')_LINKER=$clang"
  export "CC_$under=$clang"
  export "AR_$under=$bin/llvm-ar"
  cargo build --release --manifest-path "$engine/Cargo.toml" -p wingtip-ffi --target "$target"
  mkdir -p "$out/$abi"
  cp "$engine/target/$target/release/$lib" "$out/$abi/$lib"
done
mkdir -p "$out/include"
cp "$here/include/wingtip_engine.h" "$out/include/wingtip_engine.h"
echo "built $out"
