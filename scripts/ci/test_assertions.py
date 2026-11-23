"""Every test asserts, and none is left skipped (docs/CI.md, "Rules", 13;
the test-quality audit, 2026-11-21): either looks like coverage and is none.

Fails on a test whose body holds no assertion and calls no helper that
does (a helper asserts when its body does or calls one that does, found by
name across its suite), in the Playwright specs, pytest, the engine's
#[test]s, JUnit, XCTest and Swift Testing, and Android's tests; and on a
test skipped with no condition (`test.skip("…")`, `test.fixme`,
`@pytest.mark.skip`, `#[ignore]`, `@Disabled`, `@Ignore`, `.disabled`).
A skip that says when (`test.skip(isMobile, …)`, `skipif`) stays. Vitest's
tests are ESLint's (`vitest/expect-expect`, `no-focused-tests`), and a
focused browser test ESLint's and Playwright's `forbidOnly`. No allow list:
a test this flags is given its assertion. The standard library only;
seconds. Run in ci.yml's guards job (scripts/ci/guards.sh).

  python3 scripts/ci/test_assertions.py
"""

from __future__ import annotations

import ast
import re
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parents[2]


class Suite(NamedTuple):
    """A suite's files, and where its tests (group 1 or 2 the name; the
    body the next {…}) and its helpers start, what an assertion is, and
    what a skip with no condition."""

    name: str
    globs: tuple[str, ...]
    test: re.Pattern[str]
    helper: re.Pattern[str]
    asserts: re.Pattern[str]
    skipped: re.Pattern[str]


SUITES = [
    Suite(
        "Playwright",
        ("apps/web/e2e/**/*.ts",),
        re.compile(r"^\s*test(?:\.(?:slow|fail))?\(\s*([\"'`])(.*?)\1", re.M),
        re.compile(r"(?:function\s+(\w+)\s*[<(]|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>)"),
        re.compile(r"\bexpect\b|\bassert\w*\(|\.toPass\(|\bthrow\b|\bwaitFor(?:Response|URL|Function)\("),
        re.compile(r"^\s*test\.(?:skip|fixme)\(\s*[\"'`]|^\s*test\.(?:skip|fixme)\(\s*\)", re.M),
    ),
    Suite(
        "Rust",
        ("engine/**/*.rs",),
        re.compile(r"#\[test\]\s*(?:#\[[^\]]*\]\s*)*(?:async\s+)?fn\s+(\w+)()"),
        re.compile(r"\bfn\s+(\w+)\s*(?:<[^>]*>)?\s*\("),
        re.compile(r"\b(?:debug_)?assert\w*!|\bpanic!|\bunreachable!|\.expect_err\(|\.unwrap_err\(|prop_assert|insta::"),
        re.compile(r"#\[ignore\b"),
    ),
    Suite(
        "JUnit",
        ("services/gateway/src/test/**/*.java",),
        re.compile(r"@(?:Test|ParameterizedTest)\b[^{;]*?\bvoid\s+(\w+)\s*\(()"),
        re.compile(r"\b(?:void|boolean|[A-Z]\w*(?:<[^>]*>)?)\s+(\w+)\s*\("),
        re.compile(r"\bassert\w*\(|\bverify\w*\(|\.andExpect\(|\.expect\w*\(|\bfail\(|StepVerifier|\bthrow\b"),
        re.compile(r"@Disabled\b"),
    ),
    Suite(
        "XCTest",
        ("apps/ios/*Tests/**/*.swift",),
        re.compile(
            r"(?:\bfunc\s+(test\w*)\s*\(|@Test\b(?:\((?:[^()]|\([^()]*\))*\))?\s*(?:@\w+\s+)*(?:(?:static|nonisolated|mutating)\s+)*func\s+(\w+)\s*\()"
        ),
        re.compile(r"\bfunc\s+(\w+)\s*(?:<[^>]*>)?\s*\("),
        re.compile(
            r"\bXCT(?:Assert|Fail|Unwrap|ExpectFailure)\w*|#expect\b|#require\b|\bwait\(for:|\bfulfillment\(of:|\bthrow\b|\bassert\w*\("
        ),
        re.compile(r"@Test\([^)]*\.disabled\("),
    ),
    Suite(
        "Android",
        ("apps/android/**/src/test/**/*.kt", "apps/android/**/src/androidTest/**/*.kt"),
        re.compile(r"@Test\b[^{]*?\bfun\s+(?:`([^`]+)`|(\w+))\s*\("),
        re.compile(r"\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\("),
        re.compile(
            r"\bassert\w*\b|\bverify\w*\b|\bfail\(|\bexpect\w*\(|\bcheck\(|\brequire\(|\bshould\w*\b|\bwaitUntil\w*\(|\bthrow\b|\berror\("
        ),
        re.compile(r"^\s*@Ignore\b", re.M),
    ),
]


def files(globs: tuple[str, ...]) -> list[Path]:
    spec = [f":(glob){g}" for g in globs]
    out = subprocess.run(["git", "ls-files", "--", *spec], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [ROOT / line for line in out.splitlines() if line]


RUST_RAW = re.compile(r'(?<!\w)r(#*)"')
RUST_CHAR = re.compile(r"'(?:\\.|[^\\'])'")
SWIFT_RAW = re.compile(r'#*"""|#+"')


def strip(text: str, rust: bool = False) -> str:
    """The code with comments and string contents blanked (lengths kept,
    so offsets still point at the same place), for brace matching and so
    an assertion named in a comment or a test's title is not one."""
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        two = text[i : i + 2]
        if two == "//":
            j = text.find("\n", i)
            j = n if j < 0 else j
        elif two == "/*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
        elif rust and (raw := RUST_RAW.match(text, i)):
            # A raw string, r#"…"#, holds quotes and braces of its own.
            close = '"' + raw.group(1)
            j = text.find(close, raw.end())
            j = n if j < 0 else j + len(close)
        elif rust and (ch := RUST_CHAR.match(text, i)):
            j = ch.end()
        elif not rust and (multi := SWIFT_RAW.match(text, i)):
            # Swift's raw (#"…"#) and multi-line (""" … """) strings.
            hashes = multi.group(0).rstrip('"')
            close = multi.group(0)[len(hashes) :] + hashes
            j = text.find(close, multi.end())
            j = n if j < 0 else j + len(close)
        elif c in "\"'`" and not (rust and c == "'"):
            j = i + 1
            while j < n and text[j] != c:
                j += 2 if text[j] == "\\" else 1
            # Blank the inside, keep the quotes.
            for k in range(i + 1, min(j, n)):
                if out[k] != "\n":
                    out[k] = " "
            i = j + 1
            continue
        else:
            i += 1
            continue
        for k in range(i, j):
            if out[k] != "\n":
                out[k] = " "
        i = j
    return "".join(out)


def body(code: str, start: int) -> tuple[int, int] | None:
    """The span of a function's body from just after its name or its
    arrow: the parameters, in (…), passed over whole (a `({ page })` is
    not the body), then the first {…}, braces balanced. An arrow's body
    with no braces is the rest of its line."""
    if start and code[start - 1] == "(":
        start -= 1
    at = len(code) - len(code[start:].lstrip())
    if at < len(code) and code[at] not in "({" and code[start - 2 : start] == "=>":
        end = code.find("\n", at)
        return at, len(code) if end < 0 else end
    i, parens = start, 0
    while i < len(code) and not (code[i] == "{" and parens == 0):
        parens += {"(": 1, ")": -1}.get(code[i], 0)
        i += 1
    depth = 0
    for j in range(i, len(code)):
        if code[j] == "{":
            depth += 1
        elif code[j] == "}":
            depth -= 1
            if depth == 0:
                return i, j + 1
    return None


def calls(text: str) -> set[str]:
    """The names a body calls (Rust's macros and Kotlin's and Swift's
    trailing closures among them)."""
    return set(re.findall(r"\b(\w+)\s*(?:<[^>()]*>)?\s*[(!{]", text))


def test_code(path: Path, code: str, rust: bool) -> str:
    """Where a suite's helpers live: a Rust file's #[cfg(test)] module or
    its tests/ directory, so a library function's debug_assert! does not
    make every call of it an assertion; every other suite's whole file."""
    if not rust or "/tests/" in path.as_posix():
        return code
    at = code.find("#[cfg(test)]")
    return "" if at < 0 else code[at:]


def braced(suite: Suite) -> list[str]:
    errors = []
    rust = suite.name == "Rust"
    sources = {path: strip(path.read_text(errors="replace"), rust) for path in files(suite.globs)}
    raw = {path: path.read_text(errors="replace") for path in sources}
    helpers: dict[str, list[str]] = {}  # every helper's bodies, by name
    for path, whole in sources.items():
        code = test_code(path, whole, rust)
        for m in suite.helper.finditer(code):
            name = next(g for g in m.groups() if g)
            span = body(code, m.end())
            if span:
                helpers.setdefault(name, []).append(code[span[0] : span[1]])
    asserting = {name for name, bodies in helpers.items() if any(suite.asserts.search(b) for b in bodies)}
    while True:
        more = {n for n, bodies in helpers.items() if n not in asserting and any(calls(b) & asserting for b in bodies)}
        if not more:
            break
        asserting |= more
    for path, code in sources.items():
        rel = path.relative_to(ROOT)
        for m in suite.test.finditer(raw[path] if suite.name == "Playwright" else code):
            name = next((g for g in m.groups()[1:] if g), None) or m.group(1)
            # A Playwright test's body is its arrow's, past a `{ tag }`.
            start = code.find("=>", m.end()) + 2 if suite.name == "Playwright" else m.end()
            span = body(code, start)
            if not span:
                continue
            text = code[span[0] : span[1]]
            # A Playwright test's title is a string: the match was on the raw text.
            if suite.asserts.search(text) or calls(text) & asserting:
                continue
            line = code.count("\n", 0, m.start()) + 1
            errors.append(f"{rel}:{line}: {suite.name} test '{name}' asserts nothing (no assertion, no helper that asserts)")
        for m in suite.skipped.finditer(raw[path] if suite.name == "Playwright" else code):
            line = code.count("\n", 0, m.start()) + 1
            errors.append(f"{rel}:{line}: {suite.name} test skipped with no condition; fix it or delete it")
    return errors


PY_ROOTS = (
    "services/planner/tests",
    "services/planner/tests_wingtip",
    "services/ingest",
    "services/weather",
    "services/jobs",
    "tools/xplane-driver",
)


def py_asserts(node: ast.AST, asserting: set[str]) -> bool:
    for sub in ast.walk(node):
        if isinstance(sub, (ast.Assert, ast.Raise)):
            return True
        if isinstance(sub, ast.Call):
            f = sub.func
            name = f.attr if isinstance(f, ast.Attribute) else f.id if isinstance(f, ast.Name) else ""
            if name.startswith("assert") or name in {"raises", "warns", "fail", "deprecated_call"} or name in asserting:
                return True
    return False


def python() -> list[str]:
    errors = []
    paths = [p for p in files(tuple(f"{r}/**/*.py" for r in PY_ROOTS)) if "/test" in p.as_posix() or p.name == "conftest.py"]
    trees = {}
    for path in paths:
        try:
            trees[path] = ast.parse(path.read_text(), str(path))
        except SyntaxError as e:
            errors.append(f"{path.relative_to(ROOT)}: does not parse ({e})")
    funcs = [n for t in trees.values() for n in ast.walk(t) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    helpers = [f for f in funcs if not f.name.startswith("test")]
    asserting: set[str] = set()
    while True:
        more = {f.name for f in helpers if f.name not in asserting and py_asserts(f, asserting)}
        if not more:
            break
        asserting |= more
    for path, tree in trees.items():
        rel = path.relative_to(ROOT)
        for f in (n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))):
            for d in f.decorator_list:
                target = d.func if isinstance(d, ast.Call) else d
                if isinstance(target, ast.Attribute) and ast.unparse(target).endswith(("mark.skip", "unittest.skip")):
                    errors.append(f"{rel}:{f.lineno}: pytest test '{f.name}' skipped with no condition; fix it or delete it")
            if f.name.startswith("test") and not py_asserts(f, asserting):
                errors.append(f"{rel}:{f.lineno}: pytest test '{f.name}' asserts nothing (no assert, no helper that asserts)")
    return errors


def main() -> int:
    errors = python()
    for suite in SUITES:
        errors += braced(suite)
    for e in errors:
        print(e)
    if errors:
        print(f"test_assertions: {len(errors)} test(s) that prove nothing; give each its assertion, or fix or delete the skip")
        return 1
    print("test_assertions: every test asserts, none skipped without a condition")
    return 0


if __name__ == "__main__":
    sys.exit(main())
