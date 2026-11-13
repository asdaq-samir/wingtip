#!/usr/bin/env python3
"""The simplicity ratchet: the counts the simplicity audits measure by hand,
measured on every change, none allowed to rise (CLAUDE.md, "Simplicity
rules"; the owner, 2026-11-12: "make simplicity rules as hard rules so we
don't have to run simplicity fixes").

Each metric below is one of the audit's regex counts (the 2026-11-12
report, measured the same way at both commits) or a total another guard
keeps. scripts/ci/simplicity_baseline.json holds each at its lowest so far:
a count above it fails, with what to do; a count below it is said, and
`--write` lowers the baseline to it. Nothing raises it: `--write` takes the
lower of the two, and a metric is added only with `--seed`.

The median files a change touches (the audit's change amplification) is
reported with `--report`, not gated: one commit's size is not a fault.

The standard library only, for the Mac's python3 (3.9); a second or two.

  python3 scripts/ci/simplicity_ratchet.py             check
  python3 scripts/ci/simplicity_ratchet.py --base REF  and the baseline not raised against REF (guards)
  python3 scripts/ci/simplicity_ratchet.py --write     lower the baseline to today's counts
  python3 scripts/ci/simplicity_ratchet.py --report    print every count, and the change median
"""

from __future__ import annotations

import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

import changed

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "scripts/ci/simplicity_baseline.json"
# Tests, fixtures and what a generator writes, as the audit leaves them out.
SKIP = re.compile(
    r"(\.test\.|\.spec\.|/e2e/|/tests?/|tests_wingtip/|Tests?/|androidTest/|/fixtures/|/[Gg]enerated/|apps/ios/WingtipAPI/|\.d\.ts$"
    r"|lib/engine/contract\.ts$|planner_client\.py$|planner_models\.py$)"
)


def files(prefix: str, suffix: str) -> list[str]:
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z", "--", prefix], capture_output=True, check=True)
    return [p for p in out.stdout.decode().split("\0") if p.endswith(suffix) and not SKIP.search(p)]


def text(path: str) -> str:
    try:
        return (ROOT / path).read_text(errors="replace")
    except FileNotFoundError:
        return ""


def occurrences(prefix: str, suffix: str, pattern: str) -> int:
    rx = re.compile(pattern, re.M)
    return sum(len(rx.findall(text(p))) for p in files(prefix, suffix))


def files_matching(prefix: str, suffix: str, *patterns: str) -> int:
    rxs = [re.compile(p, re.M) for p in patterns]
    return sum(1 for p in files(prefix, suffix) if all(rx.search(text(p)) for rx in rxs))


def lines(path: str) -> int:
    return text(path).count("\n")


def json_total(path: str) -> int:
    """The findings another guard's baseline holds (it only shrinks; counted here to show the trend)."""
    data = json.loads(text(path) or "{}")
    if isinstance(data, dict):
        return sum(v if isinstance(v, int) else sum(v.values()) for v in data.values())
    return len(data)


def allow_total(path: str) -> int:
    return sum(int(line.split("#", 1)[0].split()[-1]) for line in text(path).splitlines() if line.split("#", 1)[0].strip())


ANDROID = "apps/android/app/src/main"
UNIT = r"\b(0\.3048|3\.2808\d*|6076(\.\d+)?|1852(\.0)?|1\.9438\d*)\b"
# The engine's unit literals, set or used inline: the foot, the nautical
# and statute miles, their rounded ratios (nautical miles in a statute
# mile, 0.8689...; statute in a nautical, 1.1507...; knots in a metre a
# second, 1.9438...; metres a second in a knot, 0.5144...) and the
# kelvin's offset. Each is engine/crates/core/src/units.rs's alone.
ENGINE_UNIT = re.compile(
    r"(?<![\w.])(0\.3048|3\.2808\d*|6_?076(\.\d+)?|1_?852(\.0*)?|1\.852|1_?609\.344|5_?280(\.0*)?"
    r"|1\.9438\d*|0\.5144\d*|0\.8689\d*|1\.1507\d*|273\.15)(?![\w.])"
)
RUST_NOT_CODE = re.compile(r'//[^\n]*|/\*.*?\*/|r(#*)".*?"\1|b?"(\\.|[^"\\])*"|\'(\\.|[^\'\\])\'', re.S)


def rust_code(source: str) -> str:
    """A Rust file with its comments, strings and characters taken out:
    test data written in a string is data, not a factor."""
    return RUST_NOT_CODE.sub(" ", source)


# name -> (how it is counted, what to do when it rises)
METRICS = {
    # The phones' root screens, the event bus the audit's finding 5 names.
    "ios_shared_references": (
        lambda: occurrences("apps/ios", ".swift", r"\.shared\b"),
        "a new singleton reference: pass the screen's model in through .environment (FlightSession) instead",
    ),
    "ios_root_view_lines": (
        lambda: lines("apps/ios/Wingtip/Views/RootView.swift"),
        "RootView grew: put the new state in its screen's model, not the root",
    ),
    "android_root_screen_lines": (
        lambda: lines(f"{ANDROID}/kotlin/app/wingtipmaps/android/ui/RootScreen.kt"),
        "RootScreen grew: put the new state in its screen's ViewModel, not the root",
    ),
    "android_map_pane_lines": (
        lambda: lines(f"{ANDROID}/kotlin/app/wingtipmaps/android/ui/MapPane.kt"),
        "MapPane grew: move the new state into a ViewModel",
    ),
    "android_map_pane_state_lines": (
        lambda: len(re.findall(r"remember|mutableStateOf|collectAsState", text(f"{ANDROID}/kotlin/app/wingtipmaps/android/ui/MapPane.kt"))),
        "MapPane holds more state: move it into a ViewModel",
    ),
    "web_plan_workspace_lines": (
        lambda: lines("apps/web/src/features/plan/hooks/usePlanWorkspace.ts"),
        "usePlanWorkspace grew: give the new state its own hook",
    ),
    # Views that ask the engine themselves, rather than through their model (MVVM).
    "android_composables_calling_engine": (
        lambda: files_matching(ANDROID, ".kt", r"@Composable", r"\bEngine\.\w+\("),
        "a composable asks the engine: ask it from the screen's ViewModel",
    ),
    "ios_views_calling_engine": (
        lambda: files_matching("apps/ios/Wingtip/Views", ".swift", r"\bEngine\.\w+\("),
        "a view asks the engine: ask it from the screen's model",
    ),
    # A failed engine call read as an answer (the audit's "Valid states").
    "ios_try_engine_default": (
        lambda: occurrences("apps/ios", ".swift", r"try\?\s*Engine\.[^\n]*\?\?"),
        "`try? Engine… ?? default` reads a failure as an answer: show the failure (lib/problems' way)",
    ),
    # The gateway's own HTTP clients (finding 6).
    "gateway_http_client_builders": (
        lambda: occurrences("services/gateway/src/main", ".java", r"HttpClient\.new(Builder|HttpClient)\(|RestClient\.(builder|create)\("),
        "a new HTTP client in the gateway: ask the planner through PlannerClient",
    ),
    # Copied constant groups (finding 10): unit factors set as constants
    # outside the units modules, per stack.
    "python_unit_constants": (
        lambda: sum(
            len(re.findall(rf"^_?[A-Z][A-Z0-9_]*\s*=.*{UNIT}", text(p), re.M))
            for p in files("services", ".py") + files("tools", ".py")
            if not p.endswith("wingtip/units.py")
        ),
        "a unit factor set again: import it from wingtip.units",
    ),
    "web_unit_constants": (
        lambda: sum(
            len(re.findall(rf"^\s*(export\s+)?const\s+\w+\s*=.*{UNIT}", text(p), re.M))
            for p in files("apps/web/src", ".ts") + files("apps/web/src", ".tsx")
            if not p.endswith(("lib/geo.ts", "lib/units.ts"))
        ),
        "a unit factor set again: import it from lib/geo or lib/units",
    ),
    "engine_unit_literals": (
        lambda: sum(
            len(ENGINE_UNIT.findall(rust_code(text(p))))
            for p in files("engine", ".rs")
            if not p.endswith("engine/crates/core/src/units.rs")
        ),
        "a unit factor written in the engine: take it from wingtip_core::units",
    ),
    # The web's unit literals, the engine's list, set or used inline outside
    # lib/geo.ts, its one units home: web_unit_constants sees only a
    # `const … =` line, so `speed * 1.943844` passed it (round 3's K6).
    # Comments and double-quoted strings are taken out as in Rust.
    "web_unit_literals": (
        lambda: sum(
            len(ENGINE_UNIT.findall(rust_code(text(p))))
            for p in files("apps/web/src", ".ts") + files("apps/web/src", ".tsx")
            if not p.endswith("lib/geo.ts")
        ),
        "a unit factor written on the web: take it from lib/geo (M_PER_FT, M_PER_NM, KT_PER_M_S, FT_PER_SM, M_PER_SM)",
    ),
    # The phones' unit literals, the engine's list, outside each phone's one
    # units home (Foundation's Measurement and Units.swift; format/Units.kt).
    "phone_unit_literals": (
        lambda: sum(
            len(ENGINE_UNIT.findall(rust_code(text(p))))
            for p in files("apps/ios", ".swift") + files("apps/android", ".kt")
            if not p.endswith(("apps/ios/Wingtip/Format/Units.swift", "android/format/Units.kt"))
        ),
        "a unit factor written on a phone: convert with Foundation's Measurement or take it from Units.swift / format/Units.kt",
    ),
    # Web Mercator formulas on the phones: the iPhone's are Tiles/TileMath.swift's
    # alone, Android's tiles/TileGrid.kt's.
    "phone_tile_maths": (
        lambda: (
            sum(
                len(re.findall(r"log\(tan\(|atan\(sinh\(|6_378_137", text(p)))
                for p in files("apps/ios", ".swift")
                if not p.endswith("Tiles/TileMath.swift")
            )
            + sum(
                len(re.findall(r"\bln\(tan\(|atan\(sinh\(|6378137", text(p)))
                for p in files("apps/android", ".kt")
                if not p.endswith("tiles/TileGrid.kt")
            )
        ),
        "tile maths written again on a phone: use TileMath (iPhone) or TileGrid (Android)",
    ),
    # The other guards' baselines, their totals (each only shrinks; here
    # for the one trend line).
    "copy_paste_clones": (
        lambda: json_total("scripts/ci/jscpd_baseline.json"),
        "scripts/ci/jscpd_baseline.json grew: it never does; take the copy out",
    ),
    "one_home_findings": (
        lambda: json_total("scripts/ci/semgrep/baseline.json"),
        "scripts/ci/semgrep/baseline.json grew: it never does; import from the one home",
    ),
    "rules_outside_engine": (
        lambda: allow_total("scripts/ci/rules_boundary_allow.txt"),
        "scripts/ci/rules_boundary_allow.txt grew: move the rule into the engine",
    ),
    "hand_built_web_controls": (
        lambda: sum(
            v.get("no-restricted-syntax", {}).get("count", 0)
            for v in json.loads(text("apps/web/eslint-suppressions.json") or "{}").values()
        ),
        "apps/web/eslint-suppressions.json grew: use the stock component",
    ),
    "files_over_400_lines": (
        lambda: len([line for line in text("scripts/ci/file_sizes_allow.txt").splitlines() if line.strip() and not line.startswith("#")]),
        "scripts/ci/file_sizes_allow.txt grew: split the file",
    ),
}


def measure() -> dict[str, int]:
    return {name: int(count()) for name, (count, _why) in METRICS.items()}


# The audit's file filter and module rule (scratchpad amp.py of 2026-11-12):
# a module is apps/<x>, services/<x> or a top-level folder.
def change_median(commits: int = 60) -> tuple[float, float]:
    log = subprocess.run(
        ["git", "-C", str(ROOT), "log", "--first-parent", "-m", f"-{commits}", "--name-only", "--format=format:@@"],
        capture_output=True,
        text=True,
    ).stdout
    sizes, modules = [], []
    for chunk in log.split("@@")[1:]:
        names = [n for n in chunk.split() if not SKIP.search(n) and not n.endswith(".md") and not n.startswith("docs/")]
        if names:
            sizes.append(len(names))
            modules.append(len({"/".join(n.split("/")[:2]) if n.startswith(("apps/", "services/")) else n.split("/")[0] for n in names}))
    return (statistics.median(sizes), statistics.median(modules)) if sizes else (0, 0)


def main(argv: list[str]) -> int:
    now = measure()
    base: dict[str, int] = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    if "--report" in argv:
        for name, n in now.items():
            print(f"{name:38} {n:6}  (baseline {base.get(name, '-')})")
        f, m = change_median()
        print(f"{'median files per change (not gated)':38} {f:6}  over {m} module(s), the last 60 commits")
        return 0
    if "--write" in argv:
        kept = {k: min(v, base[k]) if k in base else v for k, v in now.items() if k in base or "--seed" in argv}
        BASELINE.write_text(json.dumps(kept, indent=1) + "\n")
        print(f"simplicity ratchet: baseline written, {len(kept)} metric(s)")
        return 0
    failed = False
    ref = argv[argv.index("--base") + 1] if "--base" in argv else None
    for line in changed.raised(ref, "scripts/ci/simplicity_baseline.json", base):
        failed = True
        print(f"::error file=scripts/ci/simplicity_baseline.json::raised against the base ({line}): it only goes down")
    for name, n in now.items():
        if name not in base:
            print(f"{name}: {n}, not in the baseline (add it with --write --seed)")
        elif n > base[name]:
            failed = True
            print(
                f"::error title=Simplicity ratchet::{name} rose from {base[name]} to {n}: {METRICS[name][1]}. "
                "The baseline only goes down (CLAUDE.md, 'Simplicity rules')."
            )
        elif n < base[name]:
            print(f"{name}: {n}, below the baseline's {base[name]}: `python3 scripts/ci/simplicity_ratchet.py --write` lowers it")
    if not failed:
        print(f"simplicity ratchet: {len(now)} counts, none above the baseline")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
