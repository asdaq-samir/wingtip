"""The chart's Dimmer and Contrast and the plates' see-through in each
platform's own terms: the phones' appended to the map's figures by
design_tokens_flow.py, the web's to generated/mapTokens.ts by
design_tokens_zoom.py (re-exported by lib/tokens, which stays within its
400 lines), so the generator's main file does not grow.

design/tokens.json's `chart-look` group is single numbers, 0 to 1 or an
offset on the chart's contrast: the web's CHART_LOOK (lib/map/chartLook,
features/plates/plateLook), iOS's WingtipChartLook and Android's
WingtipChartLook (ChartLook, PlateLook), one figure for all three.

Its `map-dim` group, the Dimmer's policy over what is drawn on the chart,
follows each: the web's DIMMER (lib/map/gl/mapDim), the phones'
WingtipDimmer (MapDim, MarkDim), a name, a number or a table of paint
properties by layer type each. Two figures are worked out here, once
for all three apps, from map.label.night-ink: `wordLight`, the towered
blue's night ink's luminance (WCAG 2) the words are matched to, and
`nightWord`, each night ink brought down to it (its sRGB times (that
luminance / its own)^(1/word-gamma), at most 1, each channel rounded as
JavaScript's Math.round does), so no app parses a colour again.

The figures the words' and the paper's light are worked out from (the
engine's map_dim_words, the one copy of that maths) go to the engine as
Rust constants (`rust`), so the policy's figures stay here and the
formula there.
"""

import json
import math
import re

import design_tokens_label as label
from design_tokens_colour import linear, rgba


def _tokens(tree, group="chart-look"):
    return {k: v for k, v in tree[group].items() if not k.startswith("$") and "$value" in v}


def _camel(name):
    head, *rest = name.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


DOC = "The chart's Dimmer and Contrast and the plates' see-through on the map (design/tokens.json's chart-look group)."


PAINT_DOC = "The chart's raster paint by look, its contrast and saturation (design/tokens.json's chart-paint group)."


def _ts_group(tree, group, name, doc):
    body = ["  %s: %g," % (_camel(k), t["$value"]) for k, t in _tokens(tree, group).items()]
    return "\n".join(["/** %s */" % doc, "export const %s = {" % name, *body, "} as const;"])


def _swift_group(tree, group, name, doc):
    body = ["    static let %s: Double = %g" % (_camel(k), t["$value"]) for k, t in _tokens(tree, group).items()]
    return "\n".join(["/// %s" % doc, "nonisolated enum %s {" % name, *body, "}"])


def _kotlin_group(tree, group, name, doc):
    body = ["    const val %s = %gf" % (re.sub("-", "_", k).upper(), t["$value"]) for k, t in _tokens(tree, group).items()]
    return "\n".join(["/** %s */" % doc, "object %s {" % name, *body, "}"])


def ts(tree):
    look, paint = _ts_group(tree, "chart-look", "CHART_LOOK", DOC), _ts_group(tree, "chart-paint", "CHART_PAINT", PAINT_DOC)
    return "\n".join([look, "", paint, "", _ts_dims(tree)])


def swift(tree):
    look = _swift_group(tree, "chart-look", "WingtipChartLook", DOC)
    paint = _swift_group(tree, "chart-paint", "WingtipChartPaint", PAINT_DOC)
    return "\n".join([look, "", paint, "", _swift_dims(tree)])


def kotlin(tree):
    look = _kotlin_group(tree, "chart-look", "WingtipChartLook", DOC)
    paint = _kotlin_group(tree, "chart-paint", "WingtipChartPaint", PAINT_DOC)
    return "\n".join([look, "", paint, "", _kotlin_dims(tree)])


DIM_DOC = "The Dimmer's policy over what is drawn on the chart at night (design/tokens.json's map-dim group)."


def _luminance(hex_colour):
    r, g, b = (linear(v / 255) for v in rgba(hex_colour)[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _dims(tree):
    out = {k: v["$value"] for k, v in tree["map-dim"].items() if not k.startswith("$")}
    inks = dict(label._night_ink(tree))
    light = _luminance(inks[label._colour(tree, "{color.chart.towered}")])
    gamma = out["word-gamma"]

    def level(night):
        f = min(1.0, (light / _luminance(night)) ** (1 / gamma))
        return "#" + "".join("%02x" % math.floor(v * f + 0.5) for v in rgba(night)[:3])

    out["word-light"] = light
    # The words' floor is taken at the night's own contrast, the chart's paint's.
    out["word-floor-contrast"] = tree["chart-paint"]["night-contrast"]["$value"]
    out["night-word"] = {day: level(night) for day, night in inks.items()}
    return out


#: The figures worked out here, which the map-dim group does not describe.
WORKED_ABOUT = {
    "word-light": "The towered blue's night ink's luminance (WCAG 2), the light the words are matched to.",
    "word-floor-contrast": "The night's own raster-contrast (chart-paint's night-contrast), the contrast the words' floor is taken at.",
}
#: The figures map_dim_words works with, as the engine names them.
RUST_FIGURES = ("word-light", "word-gamma", "word-least", "word-floor", "word-floor-contrast", "warning-under-paper")


def rust(tree, banner):
    """The engine's copy of the figures (engine/crates/core/src/map_dim_figures.rs)."""
    dims, own = _dims(tree), tree["map-dim"]
    out = ["// %s" % banner, "", "//! The Dimmer's figures for map_dim_words (design/tokens.json's map-dim group)."]
    for k in RUST_FIGURES:
        about = own[k]["$description"] if k in own else WORKED_ABOUT[k]
        out += ["", "/// %s" % about, "pub const %s: f64 = %r;" % (k.replace("-", "_").upper(), float(dims[k]))]
    return "\n".join(out) + "\n"


def _ts_dims(tree):
    body = ["  %s: %s," % (_camel(k), json.dumps(v)) for k, v in _dims(tree).items()]
    return "\n".join(["/** %s */" % DIM_DOC, "export const DIMMER = {", *body, "} as const;"])


def _swift_value(v):
    if isinstance(v, str):
        return "String", json.dumps(v)
    if isinstance(v, dict) and all(isinstance(p, str) for p in v.values()):
        return "[String: String]", "[%s]" % ", ".join("%s: %s" % (json.dumps(k), json.dumps(p)) for k, p in v.items())
    if isinstance(v, dict):
        pairs = ", ".join("%s: [%s]" % (json.dumps(k), ", ".join(json.dumps(p) for p in ps)) for k, ps in v.items())
        return "[String: [String]]", "[%s]" % pairs
    return "Double", repr(v) if isinstance(v, float) and "%g" % v != repr(v) else "%g" % v


def _swift_dims(tree):
    body = ["    static let %s: %s = %s" % ((_camel(k),) + _swift_value(v)) for k, v in _dims(tree).items()]
    return "\n".join(["/// %s" % DIM_DOC, "nonisolated enum WingtipDimmer {", *body, "}"])


def _kotlin_line(k, v):
    name = re.sub("-", "_", k).upper()
    if isinstance(v, str):
        return "    const val %s = %s" % (name, json.dumps(v))
    if isinstance(v, dict) and all(isinstance(p, str) for p in v.values()):
        return "    val %s: Map<String, String> = mapOf(%s)" % (
            name,
            ", ".join("%s to %s" % (json.dumps(k), json.dumps(p)) for k, p in v.items()),
        )
    if isinstance(v, dict):
        pairs = ", ".join("%s to listOf(%s)" % (json.dumps(t), ", ".join(json.dumps(p) for p in ps)) for t, ps in v.items())
        return "    val %s: Map<String, List<String>> = mapOf(%s)" % (name, pairs)
    if isinstance(v, float) and "%g" % v != repr(v):
        return "    const val %s = %s" % (name, repr(v))
    return "    const val %s = %gf" % (name, v)


def _kotlin_dims(tree):
    body = [_kotlin_line(k, v) for k, v in _dims(tree).items()]
    return "\n".join(["/** %s */" % DIM_DOC, "object WingtipDimmer {", *body, "}"])
