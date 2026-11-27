"""Android's overlay layers for map_style.py: design/map-style.json's layers
as the JSON MapLibre Native takes, each app's own part resolved to plain
values -- the words' font (the bold Inter, the one the app's glyphs hold)
and size by design/tokens.json's map.label.kind, their halo, and their
day ink, which MapLabels turns for the night -- in OverlayStyle.kt.
Standard library only.
"""

import json

from map_style import BANNER, Hook, Resolver, camel, layers, upper


def android_hooks(r, node):
    label = r.tokens["map"]["label"]
    scale = {k[5:] or "normal": v["$value"] for k, v in label.items() if k.startswith("size")}

    def kind(name):
        return label["kind"][name]["$value"]

    def halo(name):
        h = kind(name)["halo"]
        return None if h == "none" else r.token("color.chart.casing" if h == "light" else "color.chart.tag")

    if isinstance(node, Hook):
        return android_hooks(r, node.value) if node.kind == "ink" else halo(node.value)
    if isinstance(node, list):
        return [android_hooks(r, n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {}
    for k, v in node.items():
        if isinstance(k, tuple) and k[0] == "label":
            spec = kind(k[1])
            if spec["weight"] != "bold":
                raise SystemExit(f"map.label.kind.{k[1]}: Android's map has the bold Inter's glyphs alone")
            size = spec["size"]
            px = scale[size] if isinstance(size, str) else None
            out["text-font"] = [r.app["font"]]
            stops = [] if px is not None else [x for z, s in size for x in (z - 1, scale[s])]
            out["text-size"] = px if px is not None else ["interpolate", ["linear"], ["zoom"], *stops]
        elif isinstance(k, tuple):
            if halo(k[1]) is not None:
                out["text-halo-color"], out["text-halo-width"] = halo(k[1]), label["halo"]["$value"]
        else:
            out[k] = android_hooks(r, v)
    return out


def kotlin_string(value):
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    if '"""' in text or "$" in text:
        raise SystemExit("design/map-style.json: a layer Kotlin's raw string cannot hold")
    return '"""' + text + '"""'


def android(style, tokens):
    r = Resolver(style, tokens, "android")
    lines, g1 = layers(r, "lines")
    marks, g2 = layers(r, "marks")
    lines, marks = android_hooks(r, lines), android_hooks(r, marks)
    groups = {**g1, **{k: g1.get(k, []) + v for k, v in g2.items()}}
    consts = lambda s: [f'        const val {upper(camel(n))} = "{n}"' for n in sorted(s)]  # noqa: E731
    out = [
        f"// {BANNER}",
        "",
        "package app.wingtipmaps.android.map.generated",
        "",
        "/** The map's overlay layers (design/map-style.json), as MapLibre Native takes them: JSON arrays of layers. */",
        "object OverlayStyle {",
        "    /** The layers under the route's slot, bottom to top, one a line. */",
        "    val LINES: List<String> = listOf(",
        *[f"        {kotlin_string(layer)}," for layer in lines],
        "    )",
        "",
        "    /** And over it: the navaids, the fixes and waypoints, the airports. */",
        "    val MARKS: List<String> = listOf(",
        *[f"        {kotlin_string(layer)}," for layer in marks],
        "    )",
        "",
        "    /** The layers each switch turns off, by the switch. */",
        "    val GROUPS: Map<String, List<String>> = mapOf(",
        *[f'        "{k}" to listOf({", ".join(json.dumps(i) for i in v)}),' for k, v in groups.items()],
        "    )",
        "",
        "    /** The sources the layers draw from, by name: the app's own to add. */",
        "    object Sources {",
        *[f'        const val {upper(camel(k))} = "{v}"' for k, v in style["sources"].items() if not k.startswith("$")],
        "    }",
        "",
        "    /** The map's global state the layers read, set by the app. */",
        "    object State {",
        *consts(r.states),
        "    }",
        "}",
        "",
    ]
    return "\n".join(out)
