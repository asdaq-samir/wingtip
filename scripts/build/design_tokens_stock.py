"""The web's Native look beyond its colours (design/tokens.json stock), for
scripts/build/design_tokens.py: shadcn's and Tailwind's own corners,
shadows, type, states and sheet timing, as they ship, written over Wingtip's on
html[data-brand="native"] (the owner, 2026-11-10: "Native means how they
come out of the box, look and behavior wise"). Standard library only."""

from design_tokens_feel import shadow_css

# Tailwind's stock type steps, size and leading in rem (its theme's
# --text-*, --text-*--line-height), named here rather than read from its
# variables: Tailwind writes a theme variable only where a class uses it.
TAILWIND_TYPE = {
    "text-xs": ("0.75rem", "1rem"),
    "text-sm": ("0.875rem", "1.25rem"),
    "text-base": ("1rem", "1.5rem"),
    "text-lg": ("1.125rem", "1.75rem"),
    "text-xl": ("1.25rem", "1.75rem"),
    "text-2xl": ("1.5rem", "2rem"),
}


def _tokens(group):
    return {k: v for k, v in group.items() if not k.startswith("$") and isinstance(v, dict) and "$value" in v}


def material_css(mat):
    """A material group's declarations, the look's own and the Native look's alike: the map buttons'
    glass, the floating bar's denser glass (the airport card's tabs) and the sheet's frost."""
    return [
        ("glass-blur", "%gpx" % mat["glass-blur"]),
        ("glass-fill-light", "%g%%" % (mat["glass-fill"] * 100)),
        ("glass-fill-dark", "%g%%" % (mat["glass-fill-dark"] * 100)),
        ("glass-bar-blur", "%gpx" % mat["bar-blur"]),
        ("glass-bar-fill", "%g%%" % (mat["bar-fill"] * 100)),
        ("sheet-blur", "%gpx" % mat["sheet-blur"]),
    ]


def css(tree):
    """The declarations for :root[data-brand="native"]."""
    g = tree["stock"]
    out = [
        ("radius-%s" % k, ("%grem" % (t["$value"] / 16)) if k == "card" else "%gpx" % t["$value"]) for k, t in _tokens(g["radius"]).items()
    ]
    out += [("depth-%s" % k, shadow_css(t["$value"])) for k, t in _tokens(g["depth"]).items()]
    out += material_css({k: t["$value"] for k, t in _tokens(g["material"]).items()})
    for k, t in _tokens(g["motion"]).items():
        v = t["$value"]
        out.append(("motion-%s" % k, "cubic-bezier(%s)" % ", ".join("%g" % x for x in v) if isinstance(v, list) else "%gs" % v))
    for role, t in _tokens(g["type"]).items():
        size, lead = TAILWIND_TYPE[t["$value"]]
        out += [("type-%s" % role, size), ("lead-%s" % role, lead)]
    return out
