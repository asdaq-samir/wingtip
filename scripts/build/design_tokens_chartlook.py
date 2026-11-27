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
"""

import json
import math
import re

import design_tokens_label as label
from design_tokens_colour import rgba


def _tokens(tree):
    return {k: v for k, v in tree["chart-look"].items() if not k.startswith("$") and "$value" in v}


def _camel(name):
    head, *rest = name.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


DOC = "The chart's Dimmer and Contrast and the plates' see-through on the map (design/tokens.json's chart-look group)."


def ts(tree):
    body = ["  %s: %g," % (_camel(k), t["$value"]) for k, t in _tokens(tree).items()]
    return "\n".join(["/** %s */" % DOC, "export const CHART_LOOK = {", *body, "} as const;", "", _ts_dims(tree)])


def swift(tree):
    body = ["    static let %s: Double = %g" % (_camel(k), t["$value"]) for k, t in _tokens(tree).items()]
    return "\n".join(["/// %s" % DOC, "nonisolated enum WingtipChartLook {", *body, "}", "", _swift_dims(tree)])


def kotlin(tree):
    body = ["    const val %s = %gf" % (re.sub("-", "_", k).upper(), t["$value"]) for k, t in _tokens(tree).items()]
    return "\n".join(["/** %s */" % DOC, "object WingtipChartLook {", *body, "}", "", _kotlin_dims(tree)])


DIM_DOC = "The Dimmer's policy over what is drawn on the chart at night (design/tokens.json's map-dim group)."


def _linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _luminance(hex_colour):
    r, g, b = (_linear(v / 255) for v in rgba(hex_colour)[:3])
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
    out["night-word"] = {day: level(night) for day, night in inks.items()}
    return out


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
        return "    val %s: Map<String, String> = mapOf(%s)" % (name, ", ".join("%s to %s" % (json.dumps(k), json.dumps(p)) for k, p in v.items()))
    if isinstance(v, dict):
        pairs = ", ".join("%s to listOf(%s)" % (json.dumps(t), ", ".join(json.dumps(p) for p in ps)) for t, ps in v.items())
        return "    val %s: Map<String, List<String>> = mapOf(%s)" % (name, pairs)
    if isinstance(v, float) and "%g" % v != repr(v):
        return "    const val %s = %s" % (name, repr(v))
    return "    const val %s = %gf" % (name, v)


def _kotlin_dims(tree):
    body = [_kotlin_line(k, v) for k, v in _dims(tree).items()]
    return "\n".join(["/** %s */" % DIM_DOC, "object WingtipDimmer {", *body, "}"])
