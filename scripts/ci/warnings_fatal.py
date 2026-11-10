"""Warnings are errors, in every toolchain (docs/CI.md, "Rules"; the owner,
2026-11-09; decision 0034).

Each line of FLAGS is one toolchain's switch, the file that holds it and
how it must read. A switch missing or turned off fails here, naming the
file and what to write, so a warning can never again be let stand by a
config edit nobody noticed. The standard library only; seconds. Run in
ci.yml's rules-boundary job.

  python3 scripts/ci/warnings_fatal.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# (what, file, pattern that must match, what to write if it does not)
FLAGS = [
    ("TypeScript strict", "apps/web/tsconfig.json", r'"strict"\s*:\s*true', '"strict": true in compilerOptions'),
    (
        "ESLint, no warning let stand",
        "apps/web/package.json",
        r'"lint"\s*:\s*"eslint [^"]*--max-warnings 0',
        '"lint": "eslint . --max-warnings 0"',
    ),
    ("ESLint in CI, no warning", ".github/workflows/ci.yml", r"eslint \. --max-warnings 0", "npx eslint . --max-warnings 0 in test-web"),
    (
        "Swift warnings are errors",
        "apps/ios/project.yml",
        r"^\s*SWIFT_TREAT_WARNINGS_AS_ERRORS:\s*YES\b",
        "SWIFT_TREAT_WARNINGS_AS_ERRORS: YES in settings.base",
    ),
    (
        "Clang warnings are errors",
        "apps/ios/project.yml",
        r"^\s*GCC_TREAT_WARNINGS_AS_ERRORS:\s*YES\b",
        "GCC_TREAT_WARNINGS_AS_ERRORS: YES in settings.base",
    ),
    (
        "Kotlin warnings are errors",
        "apps/android/app/build.gradle.kts",
        r"allWarningsAsErrors(?:\.set\(true\)|\s*=\s*true)",
        "allWarningsAsErrors.set(true) in kotlin.compilerOptions",
    ),
    (
        "Android lint warnings are errors",
        "apps/android/app/build.gradle.kts",
        r"^\s*warningsAsErrors\s*=\s*true",
        "warningsAsErrors = true in android.lint",
    ),
    (
        "Android lint fails the build",
        "apps/android/app/build.gradle.kts",
        r"^\s*abortOnError\s*=\s*true",
        "abortOnError = true in android.lint",
    ),
    (
        "Rust warnings denied",
        "engine/Cargo.toml",
        r'\[workspace\.lints\.rust\][^\[]*\bwarnings\s*=\s*"deny"',
        'warnings = "deny" under [workspace.lints.rust]',
    ),
    (
        "clippy warnings denied in CI",
        ".github/workflows/ci.yml",
        r"cargo clippy [^\n]*-- -D warnings",
        "cargo clippy ... -- -D warnings in the test job",
    ),
    (
        "javac warnings fail the build",
        "services/gateway/pom.xml",
        r"<failOnWarning>true</failOnWarning>",
        "<failOnWarning>true</failOnWarning> in maven-compiler-plugin",
    ),
    ("javac lints on", "services/gateway/pom.xml", r"<arg>-Xlint:all", "<arg>-Xlint:all,...</arg> in compilerArgs"),
    ("ruff on", ".ruff.toml", r'^select\s*=\s*\[\s*"E",\s*"F"', 'select = ["E", "F", ...] under [lint]'),
]


def text(path: str) -> str:
    try:
        return (ROOT / path).read_text()
    except FileNotFoundError:
        return ""


def rust_members() -> list[str]:
    """Every engine crate must take the workspace's lints."""
    errors = []
    for cargo in sorted((ROOT / "engine").rglob("Cargo.toml")):
        rel = cargo.relative_to(ROOT).as_posix()
        if rel == "engine/Cargo.toml" or "/target/" in rel:
            continue
        if not re.search(r"^\[lints\]\s*\nworkspace\s*=\s*true", cargo.read_text(), re.M):
            errors.append(f"{rel}: Rust warnings not denied: add [lints] with workspace = true")
    return errors


def pytest_suites() -> list[str]:
    """Every Python suite with pytest settings turns warnings into errors first."""
    errors = []
    for project in sorted(ROOT.glob("services/*/pyproject.toml")):
        body = project.read_text()
        if "[tool.pytest" not in body:
            continue
        m = re.search(r"filterwarnings\s*=\s*\[\s*([\"'])(.*?)\1", body)
        if not m or m.group(2) != "error":
            rel = project.relative_to(ROOT).as_posix()
            errors.append(f'{rel}: pytest warnings not errors: filterwarnings = ["error", ...] under [tool.pytest.ini_options]')
    return errors


def ruff_in_ci() -> list[str]:
    ci = text(".github/workflows/ci.yml")
    return [] if re.search(r"^\s*- run: ruff check ", ci, re.M) else [".github/workflows/ci.yml: no `ruff check` step"]


def main() -> int:
    errors = []
    for what, path, pattern, fix in FLAGS:
        if not re.search(pattern, text(path), re.M | re.S):
            errors.append(f"{path}: {what} is off or missing: {fix}")
    errors += rust_members() + pytest_suites() + ruff_in_ci()
    for error in errors:
        print(f"::error title=Warnings fatal::{error}" if "GITHUB_ACTIONS" in os.environ else error)
    if not errors:
        print(f"warnings fatal: {len(FLAGS)} switches, every engine crate and every pytest suite")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
