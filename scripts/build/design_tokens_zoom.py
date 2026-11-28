"""The zooms each kind of airport and airspace is drawn from, in each
platform's own terms, for design_tokens.py.

design/tokens.json's `map.zoom` group is single numbers, each a zoom in
the app's levels (MapLibre's plus one, the web's glZoom). The web, the
iPhone and Android draw each kind from its zoom; the charts job's overlay
tiles hold it from a zoom less, in the tiles' own (MapLibre's) levels, so
the four agree from one number. The Python module is the charts job's
(services/jobs/charts/map_zoom.py), which the tile build reads.
"""

import re
import textwrap
from pathlib import Path

import design_tokens_chartlook as chartlook
import design_tokens_label as label

PYTHON = Path("services/jobs/charts/map_zoom.py")
# The web's MAP_ZOOM and MAP_LABEL are a file of their own, which lib/tokens
# re-exports, so lib/tokens stays within the 400-line budget
# (scripts/ci/file_sizes.py; generated/ folders are left out of it).
WEB = Path("apps/web/src/lib/generated/mapTokens.ts")
# The Dimmer's figures for the engine's map_dim_words (design_tokens_chartlook.rust).
RUST = Path("engine/crates/core/src/map_dim_figures.rs")
TS_REEXPORT = 'export { CHART_LOOK, CHART_PAINT, DIMMER, MAP_LABEL, MAP_ZOOM, type MapLabelKind } from "./generated/mapTokens";'
HEAD = "From which zoom each kind of airport, airspace and navaid is drawn (design/tokens.json's map.zoom), in the app's levels, MapLibre's + 1."


def _zooms(tree):
    return {k: t for k, t in tree["map"]["zoom"].items() if not k.startswith("$")}


def _camel(name):
    head, *rest = name.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def _upper(name):
    return re.sub("-", "_", name).upper()


def ts(tree):
    out = ["/** %s */" % HEAD, "export const MAP_ZOOM = {"]
    for k, t in _zooms(tree).items():
        out += ["  /** %s */" % t["$description"], "  %s: %g," % (_camel(k), t["$value"])]
    return "\n".join(out + ["} as const;"])


def swift(tree):
    out = ["/// %s" % HEAD, "nonisolated enum WingtipMapZoom {"]
    for k, t in _zooms(tree).items():
        out += ["    /// %s" % t["$description"], "    static let %s: Double = %g" % (_camel(k), t["$value"])]
    return "\n".join(out + ["}"])


def kotlin(tree):
    out = ["/** %s */" % HEAD, "object WingtipMapZoom {"]
    for k, t in _zooms(tree).items():
        out += ["    /** %s */" % t["$description"], "    const val %s = %s" % (_upper(k), float(t["$value"]))]
    return "\n".join(out + ["}"])


def python(tree, banner):
    # Wrapped within ruff's 140 columns (.ruff.toml), as the job's own code is.
    out = ['"""%s' % banner, "", *textwrap.wrap(HEAD, 100)]
    out[-1] += '"""'
    for k, t in _zooms(tree).items():
        out += ["", *("#: " + line for line in textwrap.wrap(t["$description"], 100)), "%s = %d" % (_upper(k), t["$value"])]
    return "\n".join(out) + "\n"


def outputs(tree, root, banner):
    """The files written whole beside the four token files, by path: the
    charts job's zooms and the web's MAP_ZOOM, with its MAP_LABEL
    (design_tokens_label) and CHART_LOOK (design_tokens_chartlook)."""
    web = "/* %s */\n\n%s\n\n%s\n\n%s\n" % (banner, ts(tree), label.ts(tree), chartlook.ts(tree))
    return {root / PYTHON: python(tree, banner), root / WEB: web, root / RUST: chartlook.rust(tree, banner)}
