"""The map's camera points and Model Weather's colour scales in each
platform's own terms, for design_tokens.py.

design/tokens.json's `map` group is single numbers (pitches in degrees,
zooms); its `flow` group is ramps (stops of value, a color.weather name
and an opacity in 255ths), the opacities of the fields the engine's
bands shape, and the covers. Each function takes the tree and the
generator's camelCase, and returns the text one generated file appends.
"""

import re

from design_tokens_colour import rgba


def _tokens(group):
    return {k: v for k, v in group.items() if not k.startswith("$")}


def _weather(tree, name):
    r, g, b, _ = rgba(tree["color"]["weather"][name]["$value"])
    return r, g, b


def _kind(name):
    return name.split("-", 1)[0]


def _rest(name):
    return name.split("-", 1)[1]


def _camel(name):
    head, *rest = name.split("-")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def _num(v):
    return "%g" % v


def ts(tree):
    m, f = _tokens(tree["map"]), _tokens(tree["flow"])
    out = [
        "/** The map's camera and the zooms its marks change at (design/tokens.json's map group); pitches in degrees. */",
        "export const MAP = {",
        *["  %s: %s," % (_camel(k), _num(t["$value"])) for k, t in m.items()],
        "} as const;",
        "",
        "/** A colour-ramp stop: the value in the field's unit and its colour as [r, g, b, 255ths], as weatherlayers-gl takes it. */",
        "type FlowStop = [number, [number, number, number, number]];",
        "/** Model Weather's colour scales: ramps, the opacities of the banded fields, and how strongly each covers the chart. */",
        "export const FLOW: {",
        "  ramp: Record<%s, FlowStop[]>;" % " | ".join('"%s"' % _rest(k) for k in f if _kind(k) == "ramp"),
        "  alpha: { %s };"
        % "; ".join(
            "%s: %s" % (_rest(k), "number[]" if isinstance(t["$value"], list) else "number") for k, t in f.items() if _kind(k) == "alpha"
        ),
        "  cover: { %s };" % "; ".join("%s: number" % _rest(k) for k in f if _kind(k) == "cover"),
        "} = {",
        "  ramp: {",
    ]
    for k, t in f.items():
        if _kind(k) == "ramp":
            stops = ", ".join("[%s, [%d, %d, %d, %d]]" % ((_num(at),) + _weather(tree, c) + (a,)) for at, c, a in t["$value"])
            out.append("    %s: [%s]," % (_rest(k), stops))
    out += ["  },", "  alpha: {"]
    out += ["    %s: %s," % (_rest(k), t["$value"]) for k, t in f.items() if _kind(k) == "alpha"]
    out += ["  },", "  cover: {"]
    out += ["    %s: %s," % (_rest(k), _num(t["$value"])) for k, t in f.items() if _kind(k) == "cover"]
    return "\n".join(out + ["  },", "};"])


def swift(tree):
    m, f = _tokens(tree["map"]), _tokens(tree["flow"])
    out = [
        "/// The map's camera and the zooms its marks change at (design/tokens.json's map group); pitches in degrees.",
        "enum WingtipMap {",
    ]
    out += ["    static let %s: Double = %s" % (_camel(k), _num(t["$value"])) for k, t in m.items()]
    out += [
        "}",
        "",
        "/// Model Weather's colour scales: ramps (value, colour, opacity in 255ths), the banded fields' opacities, and the covers.",
        "enum WingtipFlow {",
        "    typealias Stop = (at: Double, colour: UIColor, alpha: UInt8)",
    ]
    for k, t in f.items():
        v, name = t["$value"], _camel(k)
        if _kind(k) == "ramp":
            stops = ", ".join("(%s, WingtipColor.Weather.%s, %d)" % (_num(at), _camel(c), a) for at, c, a in v)
            out.append("    static let %s: [Stop] = [%s]" % (name, stops))
        elif _kind(k) == "alpha":
            out.append("    static let %s: %s = %s" % (name, "[UInt8]" if isinstance(v, list) else "UInt8", v))
        else:
            out.append("    static let %s: CGFloat = %s" % (name, _num(v)))
    return "\n".join(out + ["}"])


def kotlin(tree):
    m, f = _tokens(tree["map"]), _tokens(tree["flow"])
    up = lambda k: re.sub("-", "_", k).upper()  # noqa: E731
    out = [
        "/** The map's camera and the zooms its marks change at (design/tokens.json's map group); pitches in degrees. */",
        "object WingtipMap {",
    ]
    out += ["    const val %s = %s" % (up(k), _num(t["$value"])) for k, t in m.items()]
    out += [
        "}",
        "",
        "/** Model Weather's colour scales: ramps (value, colour, opacity in 255ths), the banded fields' opacities, and the covers. */",
        "object WingtipFlow {",
        "    class Stop(val at: Double, val colour: Color, val alpha: Int)",
    ]
    for k, t in f.items():
        v = t["$value"]
        if _kind(k) == "ramp":
            stops = ", ".join(
                "Stop(%s, WingtipColors.Weather.%s, %d)" % (float(at), c.replace("-", " ").title().replace(" ", ""), a) for at, c, a in v
            )
            out.append("    val %s = listOf(%s)" % (up(k), stops))
        elif _kind(k) == "alpha":
            out.append("    val %s = %s" % (up(k), "listOf(%s)" % ", ".join(map(str, v)) if isinstance(v, list) else v))
        else:
            out.append("    const val %s = %sf" % (up(k), _num(v)))
    return "\n".join(out + ["}"])
