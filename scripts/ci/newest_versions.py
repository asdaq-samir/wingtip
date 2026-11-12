"""What has a newer release than this repository pins, once a week, in one
standing issue (.github/workflows/versions.yml; docs/versions.md, "Newest,
always, majors too"; decision 0034).

Each list is read from its source of truth and asked of its registry:

- the toolchains in .tool-versions (endoflife.date, Gradle's and Maven
  Central's own lists, PyPI and npm for the formatters);
- the web's packages (`npm outdated --json`, run by the workflow; its
  output is the --npm file);
- the Python pins (`name==version` in every requirements file) against PyPI;
- the engine's crates, as Cargo.lock holds them, against crates.io;
- the Android version catalog against Google Maven, Maven Central and the
  Gradle plugin portal;
- the gateway's Maven dependencies and plugins (`mvn
  versions:display-dependency-updates display-plugin-updates`, run by the
  workflow; its output is the --maven file).

What docs/versions.md's "Held back" table names (TypeScript 7, Java past
25, ...) is listed as held, not as new. Pre-releases are not offered
unless the pin is one already (Material 3's rc, decision 0016), but for
the phones' platform libraries (PLATFORM: Compose, Material 3, the rest of
androidx and Google's) and the simplicity guards' tools, where an rc,
beta or alpha newer than the pin counts as newest (the owner, 2026-11-12:
"use the latest libraries and components for each OS even if it's a rc").

The issue, "Newer versions (weekly)", is a checklist, made once and then
edited, never commented on: at most one GitHub write a week, and none when
the list is unchanged (CLAUDE.md, "Write to GitHub gently"). Dependabot
opens no pull requests (decision 0024); this is the list an upgrade pass
works from.

  python3 scripts/ci/newest_versions.py [--npm FILE] [--maven FILE] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TITLE = "Newer versions (weekly)"
UA = {"User-Agent": "wingtip-maps-versions (github.com/asdaq-samir/wingtip)"}


def get(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode()


RANK = {"alpha": 0, "a": 0, "beta": 1, "b": 1, "rc": 2, "cr": 2}


def key(version: str) -> tuple:
    """Release numbers, then alpha < beta < rc < the release itself."""
    m = re.match(r"v?(\d+(?:\.\d+)*)[.-]?([A-Za-z]*)[.-]?(\d*)", version)
    if not m:
        return ((), -1, 0)
    release = tuple(int(n) for n in m.group(1).split("."))
    tag = m.group(2).lower()
    return (release, RANK.get(tag, 3 if not tag else -1), int(m.group(3) or 0))


def kind(version: str) -> str:
    """ "" for a release, "pre" for alpha/beta/rc, "other" for a variant (-globe, +1, -jre)."""
    rest = re.sub(r"^v?\d+(?:\.\d+)*", "", version)
    if not rest:
        return ""
    return "pre" if re.fullmatch(r"[.-]?(alpha|a|beta|b|rc|cr)[.-]?\d*", rest.lower()) else "other"


def newer(pinned: str, newest: str | None) -> bool:
    """Newer at the pin's own precision: Node "26" is not behind 26.1.0."""
    if not newest:
        return False
    pin, new = key(pinned), key(newest)
    if new[0][: len(pin[0])] != pin[0]:
        return new[0][: len(pin[0])] > pin[0]
    return len(pin[0]) > 1 and new[1:] > pin[1:]


# The Android catalog's groups whose pre-releases count as newest.
PLATFORM = re.compile(r"^(androidx\.|com\.google\.android\.|com\.android\.)")


def best(versions: list[str], pinned: str, pre: bool = False) -> str | None:
    """The newest of a registry's list: releases, and pre-releases for a pre-release pin or when `pre`."""
    allowed = {"", "pre"} if pre or kind(pinned) == "pre" else {""}
    ok = [v for v in versions if kind(v) in allowed]
    return max(ok, key=key) if ok else None


def holds() -> set[str]:
    text = (ROOT / "docs/versions.md").read_text()
    table = text.split("## Held back", 1)[-1].split("\n## ", 1)[0]
    rows = [r.split("|")[1] for r in table.splitlines() if r.startswith("| ") and not r.startswith("| What")]
    return {re.sub(r"\(.*?\)|\s", "", r).lower() for r in rows}


def held(name: str, hold: set[str]) -> bool:
    last = re.split(r"[:/]", name.lower())[-1]
    return name.lower() in hold or last in hold


def safely(fn, *args):
    try:
        return fn(*args)
    except Exception:  # noqa: BLE001 -- one registry down is one line missing, not the report
        return None


def eol(product: str, field: str = "latest") -> str | None:
    """endoflife.date's newest release; Temurin's by its major ("cycle"), as .tool-versions pins it."""
    return best([str(c[field]) for c in json.loads(get(f"https://endoflife.date/api/{product}.json"))], "0")


def maven_meta(base: str, group: str, artifact: str, pinned: str, pre: bool = False) -> str | None:
    xml = get(f"{base}/{group.replace('.', '/')}/{artifact}/maven-metadata.xml")
    return best(re.findall(r"<version>([^<]+)</version>", xml), pinned, pre)


def npm_all(name: str) -> str | None:
    """Every published version of an npm package, pre-releases included."""
    return best(list(json.loads(get(f"https://registry.npmjs.org/{name}"))["versions"]), "0", pre=True)


def pypi_all(name: str) -> str | None:
    return best(list(json.loads(get(f"https://pypi.org/pypi/{name}/json"))["releases"]), "0", pre=True)


def github_all(repo: str) -> str | None:
    return best([r["tag_name"] for r in json.loads(get(f"https://api.github.com/repos/{repo}/releases?per_page=20"))], "0", pre=True)


def toolchains() -> list[tuple[str, str, str | None]]:
    pins = {}
    for line in (ROOT / ".tool-versions").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            name, version = line.split()[:2]
            pins[name] = version
    central = "https://repo1.maven.org/maven2"
    asks = {
        "python": lambda: eol("python"),
        "nodejs": lambda: eol("nodejs"),
        "rust": lambda: eol("rust"),
        "java": lambda: eol("eclipse-temurin", "cycle"),
        "gradle": lambda: json.loads(get("https://services.gradle.org/versions/current"))["version"],
        "maven": lambda: maven_meta(central, "org.apache.maven", "apache-maven", pins["maven"]),
        "ruff": lambda: json.loads(get("https://pypi.org/pypi/ruff/json"))["info"]["version"],
        "prettier": lambda: json.loads(get("https://registry.npmjs.org/prettier/latest"))["version"],
        "palantir-java-format": lambda: maven_meta(central, "com.palantir.javaformat", "palantir-java-format", "1"),
        "ktlint": lambda: maven_meta(central, "com.pinterest.ktlint", "ktlint-cli", "1"),
        # The simplicity guards' tools, pre-releases counted.
        "semgrep": lambda: pypi_all("semgrep"),
        "jscpd": lambda: npm_all("jscpd"),
        "dependency-cruiser": lambda: npm_all("dependency-cruiser"),
        "swiftlint": lambda: github_all("realm/SwiftLint"),
        "detekt": lambda: maven_meta(central, "dev.detekt", "detekt-cli", "0", pre=True),
    }
    out = []
    for name, ask in asks.items():
        pinned = pins.get(name, "").replace("temurin-", "")
        if pinned:
            out.append((name, pinned, safely(ask)))
    return out


def python_pins() -> list[tuple[str, str, str | None]]:
    pins: dict[str, str] = {}
    for req in sorted([*ROOT.glob("services/**/requirements*.txt"), *ROOT.glob("ml/requirements*.txt")]):
        for line in req.read_text().splitlines():
            m = re.match(r"^([A-Za-z0-9_.\-\[\]]+)==([^\s;#]+)", line.strip())
            if m:
                pins[re.sub(r"\[.*\]", "", m.group(1)).lower()] = m.group(2)

    def ask(name: str):
        return name, pins[name], safely(lambda: json.loads(get(f"https://pypi.org/pypi/{name}/json"))["info"]["version"])

    with ThreadPoolExecutor(16) as pool:
        return list(pool.map(ask, sorted(pins)))


def crates() -> list[tuple[str, str, str | None]]:
    names = set()
    for cargo in ROOT.glob("engine/**/Cargo.toml"):
        if "/target/" in cargo.as_posix():
            continue
        section = ""
        for line in cargo.read_text().splitlines():
            if line.startswith("["):
                section = line
            elif "dependencies]" in section and "=" in line and "path =" not in line:
                names.add(line.split("=")[0].strip())
    lock = (ROOT / "engine/Cargo.lock").read_text()
    locked = dict(re.findall(r'name = "([^"]+)"\nversion = "([^"]+)"', lock))

    def ask(name: str):
        info = safely(lambda: json.loads(get(f"https://crates.io/api/v1/crates/{name}"))["crate"]["max_stable_version"])
        return name, locked.get(name, "?"), info

    with ThreadPoolExecutor(8) as pool:
        return list(pool.map(ask, sorted(names)))


def gradle() -> list[tuple[str, str, str | None]]:
    text = (ROOT / "apps/android/gradle/libs.versions.toml").read_text()
    versions = dict(re.findall(r'^(\w+) = "([^"]+)"', text.split("[libraries]")[0], re.M))
    items = []
    for group, name, ref in re.findall(r'group = "([^"]+)", name = "([^"]+)", version\.ref = "(\w+)"', text):
        items.append((f"{group}:{name}", group, name, versions[ref], False))
    for plugin, ref in re.findall(r'id = "([^"]+)", version\.ref = "(\w+)"', text):
        items.append((plugin, plugin, f"{plugin}.gradle.plugin", versions[ref], True))

    def ask(item):
        label, group, name, pinned, plugin = item
        bases = ["https://dl.google.com/dl/android/maven2", "https://repo1.maven.org/maven2"]
        bases = ["https://plugins.gradle.org/m2", *bases] if plugin else bases
        for base in bases:
            found = safely(maven_meta, base, group, name, pinned, bool(PLATFORM.match(group)))
            if found:
                return label, pinned, found
        return label, pinned, None

    with ThreadPoolExecutor(16) as pool:
        return list(pool.map(ask, items))


def npm(path: str | None) -> list[tuple[str, str, str | None]]:
    if not path or not Path(path).exists() or not Path(path).read_text().strip():
        return []
    data = json.loads(Path(path).read_text())
    return [(name, v.get("current") or v.get("wanted", "?"), v.get("latest")) for name, v in sorted(data.items())]


def maven(path: str | None) -> list[tuple[str, str, str | None]]:
    if not path or not Path(path).exists():
        return []
    # A long name wraps its versions onto the next line.
    text = re.sub(r"\n\[INFO\]\s+(?=\S+ -> )", " ", Path(path).read_text())
    found = re.findall(r"\s([\w.\-]+:[\w.\-]+) \.*\s*(\S+) -> (\S+)", text)
    return sorted(set(found))


def body(sections: dict[str, list[tuple[str, str, str | None]]]) -> str:
    hold = holds()
    lines = ["What has a newer release than the repository pins, checked weekly (scripts/ci/newest_versions.py).", ""]
    lines.append("Take them in an upgrade pass as docs/versions.md says; held ones wait on the reason given there.")
    count = 0
    for title, items in sections.items():
        new = [(n, p, v) for n, p, v in items if newer(p, v)]
        lines += ["", f"### {title} ({len(new)})", ""]
        if not new:
            lines.append("Nothing newer.")
        for name, pinned, newest in new:
            if held(name, hold):
                lines.append(f"- held: `{name}` {pinned} -> {newest} (docs/versions.md, Held back)")
            else:
                count += 1
                lines.append(f"- [ ] `{name}` {pinned} -> {newest}")
        missing = [n for n, _, v in items if v is None]
        if missing:
            lines.append(f"- not asked (registry did not answer): {', '.join(missing[:20])}")
    return "\n".join(lines).replace("\n\n\n", "\n\n") + f"\n\n<!-- newer: {count} -->\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--npm")
    parser.add_argument("--maven")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    text = body(
        {
            "Toolchains (.tool-versions)": toolchains(),
            "Web (apps/web, npm outdated)": npm(args.npm),
            "Python (requirements*.txt, PyPI)": python_pins(),
            "Engine (Cargo.lock, crates.io)": crates(),
            "Android (libs.versions.toml)": gradle(),
            "Gateway (pom.xml, versions-maven-plugin)": maven(args.maven),
        }
    )
    print(text)
    if args.dry_run:
        return 0
    found = json.loads(
        subprocess.run(
            ["gh", "issue", "list", "--state", "open", "--search", f'in:title "{TITLE}"', "--json", "number,title,body"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    )
    issue = next((i for i in found if i["title"] == TITLE), None)
    if issue and (issue["body"] or "").strip() == text.strip():
        print("unchanged: nothing written")
    elif issue:
        subprocess.run(["gh", "issue", "edit", str(issue["number"]), "--body", text], check=True)
    else:
        subprocess.run(
            ["gh", "issue", "create", "--title", TITLE, "--label", "dependencies", "--label", "ready", "--body", text], check=True
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
