"""The map's words in each platform's own terms, for design_tokens.py.

design/tokens.json's `map.label` group is the map's lettering: a scale of
sizes (px), the halo's width and its strength after dark, and each kind
of label (`map.label.kind`) as a size, a weight and a halo. A kind's size
is a step of the scale or [zoom, step] pairs, zooms in the app's levels
(MapLibre's plus one), which each app interpolates between. The steps are
resolved here, so every app reads numbers: the web's MAP_LABEL, the
iPhone's and Android's WingtipMapLabel.
"""

import re

HEAD = "The map's words (design/tokens.json's map.label): the size scale (px), the halo, and each kind's size, weight and halo."
# The scale's steps by the name a kind gives them.
STEPS = {
    "small": "size-small",
    "normal": "size",
    "large": "size-large",
    "count": "size-count",
    "runway": "size-runway",
    "picked": "size-picked",
}


def _group(tree):
    return tree["map"]["label"]


def _scale(tree):
    g = _group(tree)
    return {step: g[name]["$value"] for step, name in STEPS.items()}


def _kinds(tree):
    """Each kind with its size resolved to [(zoom, px)], one stop for a fixed size."""
    scale = _scale(tree)
    out = {}
    for name, t in _group(tree)["kind"].items():
        if name.startswith("$"):
            continue
        v = t["$value"]
        size = v["size"]
        stops = [(None, scale[size])] if isinstance(size, str) else [(z, scale[s]) for z, s in size]
        if v["weight"] not in ("bold", "regular") or v["halo"] not in ("light", "dark", "none"):
            raise SystemExit(f"map.label.kind.{name}: weight is bold or regular, halo light, dark or none")
        out[name] = {"stops": stops, "bold": v["weight"] == "bold", "halo": v["halo"], "about": t["$description"]}
    return out


def _camel(name):
    head, *rest = name.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def _upper(name):
    return re.sub("-", "_", name).upper()


def ts(tree):
    g, scale = _group(tree), _scale(tree)
    out = [
        "/** A kind of map label's look: its size, fixed or by zoom (the app's levels, interpolated), its weight and its halo. */",
        "export interface MapLabelKind {",
        "  size: number | readonly (readonly [zoom: number, px: number])[];",
        "  bold: boolean;",
        '  halo: "light" | "dark" | "none";',
        "}",
        "/** %s */" % HEAD,
        "export const MAP_LABEL = {",
        "  size: { %s }," % ", ".join("%s: %g" % (k, v) for k, v in scale.items()),
        "  halo: %g," % g["halo"]["$value"],
        "  haloNight: %g," % g["halo-night"]["$value"],
        "  kind: {",
    ]
    for name, k in _kinds(tree).items():
        size = "%g" % k["stops"][0][1] if k["stops"][0][0] is None else "[%s]" % ", ".join("[%g, %g]" % s for s in k["stops"])
        line = '    %s: { size: %s, bold: %s, halo: "%s" },' % (_camel(name), size, str(k["bold"]).lower(), k["halo"])
        out += ["    /** %s */" % k["about"], line]
    return "\n".join(out + ["  },", "} as const satisfies { kind: Record<string, MapLabelKind> };"])


def swift(tree):
    g, scale = _group(tree), _scale(tree)
    out = [
        "/// %s" % HEAD,
        "enum WingtipMapLabel {",
        "    enum Halo { case light, dark, none }",
        "    /// A kind's look: its size by zoom (the app's levels; one stop is a fixed size), its weight and its halo.",
        "    struct Kind {",
        "        let size: [(zoom: Double, px: Double)]",
        "        let bold: Bool",
        "        let halo: Halo",
        "    }",
        *["    static let %s: Double = %g" % (_camel("size-" + k), v) for k, v in scale.items()],
        "    static let halo: Double = %g" % g["halo"]["$value"],
        "    static let haloNight: Double = %g" % g["halo-night"]["$value"],
    ]
    for name, k in _kinds(tree).items():
        stops = ", ".join("(%g, %g)" % (z or 0, px) for z, px in k["stops"])
        line = "    static let %s = Kind(size: [%s], bold: %s, halo: .%s)" % (_camel(name), stops, str(k["bold"]).lower(), k["halo"])
        out += ["    /// %s" % k["about"], line]
    return "\n".join(out + ["}"])


def kotlin(tree):
    g, scale = _group(tree), _scale(tree)
    out = [
        "/** %s */" % HEAD,
        "object WingtipMapLabel {",
        "    enum class Halo { LIGHT, DARK, NONE }",
        "    /** A kind's look: its size by zoom (the app's levels; one stop is a fixed size), its weight and its halo. */",
        "    class Kind(val size: List<Pair<Double, Double>>, val bold: Boolean, val halo: Halo)",
        *["    const val %s = %sf" % (_upper("size-" + k), "%g" % v) for k, v in scale.items()],
        "    const val HALO = %sf" % ("%g" % g["halo"]["$value"]),
        "    const val HALO_NIGHT = %sf" % ("%g" % g["halo-night"]["$value"]),
    ]
    for name, k in _kinds(tree).items():
        stops = ", ".join("%s to %s" % (float(z or 0), float(px)) for z, px in k["stops"])
        out += [
            "    /** %s */" % k["about"],
            "    val %s = Kind(listOf(%s), %s, Halo.%s)" % (_upper(name), stops, str(k["bold"]).lower(), k["halo"].upper()),
        ]
    return "\n".join(out + ["}"])
