"""Every place in the repo that states a toolchain's version, held to .tool-versions.

    scripts/build/toolchain.sh              write each place from .tool-versions
    scripts/build/toolchain.sh --check      say which places differ, and fail
    scripts/build/toolchain.sh get <name>   one version, as a script wants it

The file is the one source (the owner, 2026-11-09). CI's setup actions and
the scripts read it; the places that cannot read a file -- a Dockerfile's
FROM, the pom, the Gradle files, rust-toolchain.toml, .nvmrc, the dev
container, the docs -- are written here from it, and CI's architecture job
runs --check so none of them drifts. Standard library only, and Python
3.9's, as the Mac's own python3 runs it.

Not held, on purpose: .ruff.toml's target-version (py313; it says why)
and the engine wheel's abi3-py311 floor (engine/bindings/py), which say
the oldest Python the code reads on, not the one it runs on.
"""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The docs that say which versions the repo runs, in prose ("Python 3.15",
# "JDK 25"). Not every Markdown file: the others name old versions on
# purpose, for what changed when (Python 3.14's forkserver, JDK 23's javac).
DOCS = [
    "CLAUDE.md",
    "README.md",
    "docs/ARCHITECTURE.md",
    "docs/CI.md",
    "docs/LOCAL-DEV.md",
    "docs/NATIVE.md",
    "docs/NATIVE-ANDROID.md",
    ".claude/skills/checks/SKILL.md",
    ".devcontainer/devcontainer.json",
]
# Where an image is named by its tag: built, run, or written about.
IMAGE_FILES = ["*Dockerfile*", "*docker-compose*.yml", "*.sh", ".github/workflows/*.yml", "*.md"]
SKIP = ["docs/archive/*"]


def bare(version: str) -> str:
    """temurin-25 -> 25: setup-java and mise want the vendor, the rest the number.
    A version that starts with its number keeps its pre-release (18.8.0-beta-2)."""
    return version if version[:1].isdigit() else version.rsplit("-", 1)[-1]


# Each place: the files (fnmatch over the tracked paths), a pattern whose
# first group is the version, the .tool-versions name it must equal, and
# "exact", or "prefix" where a shorter version is the same one (an image's
# python:3.15 tag, pinned by digest, for 3.15.2). A hint is for a place
# another tool writes, which the script tells you to run instead.
PLACES = [
    (["apps/web/.nvmrc"], r"\A(\S+)\s*\Z", "nodejs", "exact", None),
    (["engine/rust-toolchain.toml"], r'^channel = "([^"]+)"', "rust", "exact", None),
    (["engine/*/Cargo.toml"], r'^edition = "([^"]+)"', "rust-edition", "exact", None),
    (["services/gateway/pom.xml"], r"<java\.version>([^<]+)</java\.version>", "java", "exact", None),
    (["services/gateway/pom.xml"], r"<palantirJavaFormat>\s*<version>([^<]+)</version>", "palantir-java-format", "exact", None),
    (["apps/android/app/build.gradle.kts"], r"JavaVersion\.VERSION_(\d+)", "java", "exact", None),
    (["apps/android/app/build.gradle.kts"], r"JvmTarget\.JVM_(\d+)", "java", "exact", None),
    (["apps/android/app/build.gradle.kts"], r'ndkVersion = "([^"]+)"', "android-ndk", "exact", None),
    (["apps/android/gradle/wrapper/gradle-wrapper.properties"], r"gradle-([\d.]+)-(?:all|bin)\.zip", "gradle", "exact", None),
    (
        ["apps/android/gradle/gradle-daemon-jvm.properties"],
        r"^toolchainVersion=(\d+)",
        "java",
        "exact",
        "./gradlew updateDaemonJvm --jvm-version {v} --jvm-vendor adoptium, in apps/android",
    ),
    (["services/*/requirements-dev*.txt"], r"^ruff(\S*)$", "ruff", "pin", None),
    (["scripts/build/tool.sh"], r'^MISE_SUMS="(\S+) ', "mise", "exact", "set MISE_SUMS to {v} and its releases' sha256s (SHASUMS256.txt)"),
    (["scripts/build/shared-cache.sh"], r'^SCCACHE_SUMS="(\S+) ', "sccache", "exact", "set SCCACHE_SUMS to {v} and its releases' sha256s"),
    (["apps/web/package.json"], r'"prettier": "([^"]+)"', "prettier", "exact", "npm install -D -E prettier@{v}, in apps/web"),
    (
        ["apps/web/package.json"],
        r'"dependency-cruiser": "([^"]+)"',
        "dependency-cruiser",
        "exact",
        "npm install -D -E dependency-cruiser@{v}, in apps/web",
    ),
    # The Maven CI and anyone without Docker run, through the wrapper.
    (["services/gateway/.mvn/wrapper/maven-wrapper.properties"], r"apache-maven/([^/]+)/", "maven", "exact", None),
    (["tools/msfs-agent/global.json"], r'"version": "([^"]+)"', "dotnet", "exact", None),
    ([".devcontainer/devcontainer.json"], r'features/node:1": \{ "version": "([^"]+)"', "nodejs", "exact", None),
    ([".devcontainer/devcontainer.json"], r'features/python:1": \{ "version": "([^"]+)"', "python", "exact", None),
    ([".devcontainer/devcontainer.json"], r'features/rust:1": \{ "version": "([^"]+)"', "rust", "exact", None),
    # Images by tag, each pinned by digest beside it where it is built.
    (IMAGE_FILES, r"\bpython:(\d+(?:\.\d+)*)-", "python", "prefix", None),
    (IMAGE_FILES, r"\brust:(\d+(?:\.\d+)*)-", "rust", "prefix", None),
    (IMAGE_FILES, r"\bnode:(\d+(?:\.\d+)*)-", "nodejs", "prefix", None),
    # Maven's release candidates are tagged in full (maven:4.0.0-rc-7-...).
    (IMAGE_FILES, r"\bmaven:(\d+(?:\.\d+)*(?:-rc-\d+)?)-", "maven", "prefix", None),
    (IMAGE_FILES, r"\beclipse-temurin[:-](\d+)\b", "java", "exact", None),
    # One Debian under every image that names its release.
    (IMAGE_FILES, r"\b(?:python|rust|node|postgres):[\w.]+?-(?:slim-)?(bookworm|bullseye|trixie|forky)\b", "debian", "exact", None),
    # The docs' prose.
    (DOCS, r"\b(?:JDK|Java|Temurin) (\d+)\b", "java", "exact", None),
    (DOCS, r"\bPython (3\.\d+(?:\.\d+)?)\b", "python", "prefix", None),
    (DOCS, r"\bNode (\d+)\b", "nodejs", "prefix", None),
    (DOCS, r"\bXcode (\d+(?:\.\d+)*)\b", "xcode", "exact", None),
    (DOCS, r"\bRust (1\.\d+(?:\.\d+)?)\b", "rust", "prefix", None),
]

IMAGE = re.compile(r"\b((?:python|rust|node|maven|eclipse-temurin):[0-9][\w.-]*)(@sha256:[0-9a-f]{64})?")


def read_versions() -> dict[str, str]:
    found = {}
    for line in (ROOT / ".tool-versions").read_text().splitlines():
        words = line.split("#", 1)[0].split()
        if words:
            found[words[0]] = words[1]
    return found


def tracked() -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-co", "--exclude-standard"], capture_output=True, text=True, check=True
    ).stdout
    return [p for p in out.splitlines() if not any(fnmatch.fnmatch(p, s) for s in SKIP) and (ROOT / p).is_file()]


def wanted(stated: str, version: str, how: str) -> str:
    """What a place should say: the version, or as many of its parts as the place gives."""
    if how == "pin":
        return "==" + version
    if how == "prefix":
        return ".".join(version.split(".")[: len(stated.split("."))])
    return version


def drift(write: bool) -> list[str]:
    versions = {k: bare(v) for k, v in read_versions().items()}
    paths = tracked()
    before = set(pinned(paths))
    problems: list[str] = []
    for patterns, pattern, name, how, hint in PLACES:
        version, regex, seen = versions[name], re.compile(pattern, re.M), False
        for path in sorted({p for p in paths for g in patterns if fnmatch.fnmatch(p, g)}):
            file = ROOT / path
            text = file.read_text()
            out, last = [], 0
            for m in regex.finditer(text):
                seen = True
                want = wanted(m.group(1), version, how)
                if m.group(1) == want:
                    continue
                line = text.count("\n", 0, m.start()) + 1
                if write and not hint:
                    out += [text[last : m.start(1)], want]
                    last = m.end(1)
                    print(f"toolchain: {path}:{line}: {m.group(1) or '(none)'} -> {want}")
                else:
                    todo = f"; {hint.format(v=version)}" if hint else ""
                    problems.append(f"{path}:{line}: says {name} {m.group(1) or '(none)'}, .tool-versions {version}{todo}")
            if last:
                file.write_text("".join(out) + text[last:])
        if not seen and patterns is not DOCS:
            problems.append(f"no place matches {pattern!r} any more: update {Path(__file__).name}'s PLACES")
    problems += digests(paths, versions, before if write else None)
    problems += workflows(paths)
    link = ROOT / "rust-toolchain.toml"
    if not link.is_symlink() or link.readlink().as_posix() != "engine/rust-toolchain.toml":
        problems.append("rust-toolchain.toml: must be a link to engine/rust-toolchain.toml (ln -s engine/rust-toolchain.toml)")
    return problems


def exact_tag(ref: str, versions: dict[str, str]) -> str:
    """python:3.15-slim -> python:3.15.2-slim: the tag that names the file's version alone."""
    repo, tag = ref.split(":", 1)
    name = {"python": "python", "rust": "rust", "node": "nodejs", "maven": "maven"}.get(repo)
    return repo + ":" + re.sub(r"^[\d.]+(?:-rc-\d+)?", versions[name], tag) if name else ref


def image_files(paths: list[str]) -> list[str]:
    return [p for p in paths if any(fnmatch.fnmatch(p, g) for g in IMAGE_FILES)]


def pinned(paths: list[str]) -> dict[str, set[str]]:
    """Each image tag pinned by digest somewhere, and its digests."""
    found: dict[str, set[str]] = {}
    for path in image_files(paths):
        for m in IMAGE.finditer((ROOT / path).read_text()):
            if m.group(2):
                found.setdefault(m.group(1), set()).add(m.group(2))
    return found


def digests(paths: list[str], versions: dict[str, str], before: set[str] | None) -> list[str]:
    """One digest per tag everywhere it is pinned. Writing, a tag that two
    digests pin, or that a bump just wrote, gets the digest of the tag that
    names the version alone (python:3.15.2-slim for python:3.15-slim)."""
    problems = []
    files = image_files(paths)
    for ref, found in sorted(pinned(paths).items()):
        if len(found) == 1 and (before is None or ref in before):
            continue
        if before is None:
            problems.append(f"{ref}: pinned to {len(found)} digests ({', '.join(sorted(d[8:20] for d in found))}): one, everywhere")
            continue
        digest = resolve(exact_tag(ref, versions))
        for path in files:
            file = ROOT / path
            text = file.read_text()
            new = re.sub(re.escape(ref) + r"@sha256:[0-9a-f]{64}", ref + digest, text)
            if new != text:
                file.write_text(new)
                print(f"toolchain: {path}: {ref}{digest}")
    return problems


def resolve(ref: str) -> str:
    out = subprocess.run(
        ["docker", "buildx", "imagetools", "inspect", ref, "--format", "{{json .Manifest.Digest}}"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return "@" + json.loads(out)


def workflows(paths: list[str]) -> list[str]:
    """CI reads the file itself: no version written into a workflow, and Xcode chosen by it."""
    problems = []
    for path in [p for p in paths if fnmatch.fnmatch(p, ".github/workflows/*.yml")]:
        text = (ROOT / path).read_text()
        for m in re.finditer(r"^\s*((?:python|java|node)-version(?:-file)?): *(.+)$", text, re.M):
            if m.group(1).endswith("-file") and m.group(2).strip() == ".tool-versions":
                continue
            line = text.count("\n", 0, m.start()) + 1
            key = m.group(1).removesuffix("-file")
            problems.append(f"{path}:{line}: {m.group(1)}: {m.group(2).strip()}; use {key}-file: .tool-versions")
        if "xcodebuild" in text and "scripts/ci/select-xcode.sh" not in text:
            problems.append(f"{path}: runs xcodebuild without scripts/ci/select-xcode.sh (.tool-versions' Xcode)")
        if "xcode-select -s" in text:
            problems.append(f"{path}: xcode-select -s picks an Xcode of its own; scripts/ci/select-xcode.sh picks .tool-versions'")
    return problems


def main(argv: list[str]) -> int:
    if argv[:1] == ["get"] and len(argv) == 2:
        versions = read_versions()
        if argv[1] not in versions:
            print(f"toolchain: no {argv[1]} in .tool-versions", file=sys.stderr)
            return 64
        print(bare(versions[argv[1]]))
        return 0
    if argv not in ([], ["--check"]):
        print(__doc__, file=sys.stderr)
        return 64
    problems = drift(write=not argv)
    for problem in problems:
        print(f"::error title=Toolchain drift::{problem}" if argv else f"toolchain: {problem}")
    if problems and argv:
        print("toolchain: run scripts/build/toolchain.sh to write them from .tool-versions, then commit", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
