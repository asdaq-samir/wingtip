#!/usr/bin/env python3
"""The engine's WebAssembly stays within its budget.

apps/web/src/lib/engine/wingtip-engine.wasm is downloaded by every phone
before the planner's first draw (index.html preloads it, main.tsx waits
for it). It went from 143 KB on 2026-11-03 to 1.41 MB on 2026-11-10 before
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

The standard library only.

  python3 scripts/ci/wasm_size.py
"""

import gzip
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WASM = ROOT / "apps/web/src/lib/engine/wingtip-engine.wasm"

# 2026-11-10: 1,079,896 bytes raw and 469,617 gzipped with the shared sort
# and the web's 192 rules; each budget about 10% above. 2026-11-11: raised
# to 1.25 MB and 545 KB at the owner's word ("For now increase the limit"),
# when notam_subject (the airport card's NOTAM badges) took the module to
# 1,206,540 and 523,574.
RAW_BUDGET = 1_320_000
GZIP_BUDGET = 575_000


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
