#!/usr/bin/env python3
"""The Android release's native libraries hold 16 KB pages.

Google Play: "Starting February 1, 2027, if your app updates don't support
16 KB memory page sizes, you won't be able to release these updates"
(developer.android.com/guide/practices/page-sizes). An app supports them
when every 64-bit shared library (arm64-v8a, x86_64) has each of its
PT_LOAD segments aligned to 16 KB or more, and, in an APK, each library
stored uncompressed starts at a 16 KB boundary of the zip, which is what
`zipalign -c -P 16` checks. The 32-bit ABIs are outside the rule and only
listed.

Given the release APKs and app bundles (scripts/ci/android_build.sh passes
app/build/outputs/apk/release/*.apk and bundle/release/*.aab), it reads
each library's ELF program headers and its place in the zip, prints what it
found, and fails on any library that breaks the rule, or on an archive with
no 64-bit library at all (a path that found nothing proves nothing).
The standard library only.

  python3 scripts/ci/android_16k.py app-release.apk app-release.aab
"""

import struct
import sys
import zipfile

PAGE = 16 * 1024
PT_LOAD = 1
SIXTY_FOUR = ("arm64-v8a", "x86_64")


def load_aligns(elf: bytes) -> list:
    """Each PT_LOAD segment's p_align, from the ELF's program headers."""
    if elf[:4] != b"\x7fELF":
        raise ValueError("not an ELF file")
    wide = elf[4] == 2
    end = "<" if elf[5] == 1 else ">"
    if wide:
        (phoff,) = struct.unpack_from(end + "Q", elf, 32)
        phentsize, phnum = struct.unpack_from(end + "HH", elf, 54)
    else:
        (phoff,) = struct.unpack_from(end + "I", elf, 28)
        phentsize, phnum = struct.unpack_from(end + "HH", elf, 42)
    aligns = []
    for i in range(phnum):
        at = phoff + i * phentsize
        (p_type,) = struct.unpack_from(end + "I", elf, at)
        if p_type != PT_LOAD:
            continue
        (align,) = struct.unpack_from(end + ("Q" if wide else "I"), elf, at + (48 if wide else 28))
        aligns.append(align)
    return aligns


def data_offset(path: str, info: zipfile.ZipInfo) -> int:
    """Where an entry's bytes start in the zip: past its local header."""
    with open(path, "rb") as f:
        f.seek(info.header_offset)
        header = f.read(30)
    name_len, extra_len = struct.unpack_from("<HH", header, 26)
    return info.header_offset + 30 + name_len + extra_len


def check(path: str) -> tuple:
    """The lines to print and the problems found, for one APK or bundle."""
    lines, problems, wide = [], [], 0
    bundle = path.endswith(".aab")
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            parts = info.filename.split("/")
            if bundle:
                parts = parts[1:]  # base/lib/<abi>/lib.so
            if len(parts) != 3 or parts[0] != "lib" or not parts[2].endswith(".so"):
                continue
            abi = parts[1]
            aligns = load_aligns(z.read(info))
            least = min(aligns) if aligns else 0
            where = f"{info.filename}: LOAD aligned {least // 1024} KB"
            if abi not in SIXTY_FOUR:
                lines.append(where + " (32-bit, outside the rule)")
                continue
            wide += 1
            if least < PAGE:
                problems.append(f"{info.filename}: a LOAD segment aligned {least} bytes, under 16 KB")
            if not bundle and info.compress_type == zipfile.ZIP_STORED:
                offset = data_offset(path, info)
                where += f", stored at {offset}"
                if offset % PAGE:
                    problems.append(f"{info.filename}: stored at {offset}, not on a 16 KB boundary (zipalign -P 16)")
            lines.append(where)
    if wide == 0:
        problems.append(f"{path}: no 64-bit native library found")
    return lines, problems


def main(paths: list) -> int:
    if not paths:
        print(__doc__.strip().splitlines()[-1].strip())
        return 2
    failed = []
    for path in paths:
        lines, problems = check(path)
        print(path)
        for line in lines:
            print("  " + line)
        failed += problems
    for problem in failed:
        print("16 KB pages: " + problem, file=sys.stderr)
    if not failed:
        print("16 KB pages: every 64-bit library holds them.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
