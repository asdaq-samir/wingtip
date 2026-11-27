#!/usr/bin/env python3
"""The engine's WebAssembly stays within its budget.

apps/web/src/lib/engine/wingtip-engine.wasm is downloaded by every phone
as the planner opens (index.html preloads it; the first
render does not wait, main.tsx's EngineGate). It went from 143 KB on 2026-11-03 to 1.41 MB on 2026-11-10 before
anyone measured it; one shared sort (wingtip_core::sort) took it back to
1.27 MB, and building only the rules the web asks (facade/build.rs for
wasm32, scripts/build/web_rules.py) to 1.08 MB, 470 KB gzipped. This
fails the committed module over a budget about 10% above that, raw and
gzipped (level 9, as a server sends it at its smallest), so it cannot
creep back unnoticed.

A module over the budget: find what grew with `twiggy top` and `twiggy
monos` on an unstripped build (CARGO_PROFILE_WASM_STRIP=none, the
measure-speed skill): a rule the web newly asks can bring in a whole
crate's handler (navlog_with_descents alone brought 77 KB of the nav log).
Raise the budget here only with the reason.

It also says the module's size in Brotli at 11, which the gateway sends a
browser that asks for it (the web build's .br beside the file,
WebMvcConfig): about 19% under gzip, and what an iPhone downloads. Said,
not budgeted: Python's standard library has no Brotli, so the figure comes
from the brotli CLI or Node's zlib where either is there, and the budget
stays the gzip one every machine can measure.

Per-rule entries (facade/build.rs) took the module from 1,293,813 bytes,
563,754 gzipped and 454,946 in Brotli to 1,099,029, 492,654 and 397,838
(2026-11-14): each rule a small call with its name as a constant, which
folds the inlined crate function's `match name` to the one arm.

The standard library only.

  python3 scripts/ci/wasm_size.py
"""

import gzip
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WASM = ROOT / "apps/web/src/lib/engine/wingtip-engine.wasm"

# 2026-11-10: 1,079,896 bytes raw and 469,617 gzipped with the shared sort
# and the web's 192 rules; each budget about 10% above. 2026-11-11: raised
# to 1.25 MB and 545 KB at the owner's word ("For now increase the limit"),
# when notam_subject (the airport card's NOTAM badges) took the module to
# 1,206,540 and 523,574. 2026-11-12 (d2566f607): raised to 1,320,000 and
# 575,000 when integration's module reached 1,248,403 bytes. 2026-11-14: the
# module is 1,284,722 bytes and 559,841 gzipped on claude/integration (1,270,327
# and 553,988 on main at b81400c15), 97% of the gzip budget.
# 2026-11-23 (round 4's make-room task): 1,205,318 bytes and 542,284
# gzipped, from 1,266,898 and 570,167, by taking out the three rules only
# the web's tests asked (proficiency_plan, departure_window,
# least_crosswind: the engine's own tests hold them to the same fixtures)
# and by wasm-opt's --converge and --low-memory-unused
# (build-engine-wasm.sh). Both budgets lowered to just over what keeps the
# module under WARN_AT, so the room freed (about 28 KB gzipped) is for the
# next rules and the warning says when it is nearly gone.
# 2026-11-27 (round 4's engine audit): lowered to just over the module as
# it is, 1,220,487 bytes and 562,498 gzipped with gonogo_input and
# route_typed_picks in (1,205,797 and 556,659 before them), so the budget
# is the headroom really left and the next rule that grows the module is
# looked at, never let through on room freed before (the ratchet only
# goes down).
# 2026-11-27 (round 5's engine audit): lowered again to just over the
# module, 1,172,181 bytes and 527,329 gzipped from 1,220,487 and 562,498:
# route_jurisdiction and route_adiz asked by the planner with the course
# (app.route_borders), so Natural Earth's outlines (borders.bin) and their
# reader left the module; the wind triangle and gonogo_input no longer
# asked by the web by name (gonogo_brief builds the facts itself), and
# oxygen_words in.
# 2026-11-27 (round 6's engine audit): lowered again to just over the
# module, 1,118,706 bytes and 502,955 gzipped from 1,172,181 and 527,329:
# the NOTAM reader (notam_read, notam_card, notam_subject, notam_affects)
# asked by the planner with a field's NOTAMs (app.notam_reading), with
# the round's rule changes (variable winds, closed alternates, the
# standard day) in.
RAW_BUDGET = 1_125_000
GZIP_BUDGET = 506_000
# A warning, not a failure, from here: the budget is not raised, so the next
# rule that grows the module should be looked at before it is the one that fails.
WARN_AT = 0.95


# Node's zlib at quality 11, reading the module from stdin.
NODE_BROTLI = (
    "const z=require('zlib');const c=[];process.stdin.on('data',d=>c.push(d)).on('end',()=>"
    "process.stdout.write(String(z.brotliCompressSync(Buffer.concat(c),"
    "{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}).length)))"
)


def brotli_size(data):
    """The module's bytes in Brotli at 11, or None where nothing here makes it."""
    if shutil.which("brotli"):
        return len(subprocess.run(["brotli", "-c", "-q", "11"], input=data, capture_output=True, check=True).stdout)
    if shutil.which("node"):
        return int(subprocess.run(["node", "-e", NODE_BROTLI], input=data, capture_output=True, check=True).stdout)
    return None


def main():
    data = WASM.read_bytes()
    raw, packed = len(data), len(gzip.compress(data, compresslevel=9, mtime=0))
    br = brotli_size(data)
    said = f"{br:,} in Brotli" if br else "Brotli not measured here (no brotli or node)"
    print(f"{WASM.relative_to(ROOT)}: {raw:,} bytes, {packed:,} gzipped, {said} (budgets {RAW_BUDGET:,} and {GZIP_BUDGET:,})")
    over = [
        f"{what} {size:,} over {budget:,}"
        for what, size, budget in [("raw", raw, RAW_BUDGET), ("gzipped", packed, GZIP_BUDGET)]
        if size > budget
    ]
    near = [
        f"{what} {size:,} is {size / budget:.0%} of {budget:,}"
        for what, size, budget in [("raw", raw, RAW_BUDGET), ("gzipped", packed, GZIP_BUDGET)]
        if budget * WARN_AT < size <= budget
    ]
    if near:
        print(
            f"::warning title=Engine WebAssembly near its budget::{', '.join(near)}. "
            "Find what grew with twiggy (this script's docstring); do not raise the budget."
        )
    if over:
        print(
            f"::error title=Engine WebAssembly over budget::{', '.join(over)} bytes. See scripts/ci/wasm_size.py for how to find what grew."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
