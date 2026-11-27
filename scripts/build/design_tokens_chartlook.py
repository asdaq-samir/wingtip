"""The chart's Dimmer and Contrast and the plates' see-through in each
platform's own terms, for design_tokens_flow.py (which appends them to the
map's figures, so the generator's main file does not grow).

design/tokens.json's `chart-look` group is single numbers, 0 to 1 or an
offset on the chart's contrast: the web's CHART_LOOK (lib/map/chartLook,
features/plates/plateLook), iOS's WingtipChartLook and Android's
WingtipChartLook (ChartLook, PlateLook), one figure for all three.
"""

import re


def _tokens(tree):
    return {k: v for k, v in tree["chart-look"].items() if not k.startswith("$") and "$value" in v}


def _camel(name):
    head, *rest = name.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


DOC = "The chart's Dimmer and Contrast and the plates' see-through on the map (design/tokens.json's chart-look group)."


def ts(tree):
    body = ["  %s: %g," % (_camel(k), t["$value"]) for k, t in _tokens(tree).items()]
    return "\n".join(["/** %s */" % DOC, "export const CHART_LOOK = {", *body, "} as const;"])


def swift(tree):
    body = ["    static let %s: Double = %g" % (_camel(k), t["$value"]) for k, t in _tokens(tree).items()]
    return "\n".join(["/// %s" % DOC, "nonisolated enum WingtipChartLook {", *body, "}"])


def kotlin(tree):
    body = ["    const val %s = %gf" % (re.sub("-", "_", k).upper(), t["$value"]) for k, t in _tokens(tree).items()]
    return "\n".join(["/** %s */" % DOC, "object WingtipChartLook {", *body, "}"])
