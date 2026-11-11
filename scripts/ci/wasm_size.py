#!/usr/bin/env python3
"""The engine's WebAssembly stays within its budget.

apps/web/src/lib/engine/wingtip-engine.wasm is downloaded by every phone
before the planner's first draw (index.html preloads it, main.tsx waits
for it). It went from 143 KB on 2026-11-03 to 1.41 MB on 2026-11-10 before
anyone measured it; one shared sort (wingtip_core::sort) took it back to
1.27 MB, 552 KB gzipped. This fails the committed module over a budget
about 10% above that, raw and gzipped (level 9, as a server sends it at
its smallest), so it cannot creep back unnoticed.

A module over the budget: find what grew with `twiggy top` and `twiggy
monos` on an unstripped build (CARGO_PROFILE_WASM_STRIP=none, the
measure-speed skill), and raise the budget here only with the reason.

The standard library only.

  python3 scripts/ci/wasm_size.py
"""

import gzip
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WASM = ROOT / "apps/web/src/lib/engine/wingtip-engine.wasm"

# 2026-11-10: 1,273,117 bytes raw and 551,705 gzipped after the shared
# sort, before Start At descents; each budget about 10% above.
RAW_BUDGET = 1_400_000
GZIP_BUDGET = 607_000


def main():
    data = WASM.read_bytes()
    raw, packed = len(data), len(gzip.compress(data, compresslevel=9, mtime=0))
    print(f"{WASM.relative_to(ROOT)}: {raw:,} bytes, {packed:,} gzipped (budgets {RAW_BUDGET:,} and {GZIP_BUDGET:,})")
    over = [
        f"{what} {size:,} over {budget:,}"
        for what, size, budget in [("raw", raw, RAW_BUDGET), ("gzipped", packed, GZIP_BUDGET)]
        if size > budget
    ]
    if over:
        print(
            f"::error title=Engine WebAssembly over budget::{', '.join(over)} bytes. See scripts/ci/wasm_size.py for how to find what grew."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
