"""The feel tokens as the web's custom properties, for design_tokens.py.

design/tokens.json's feel group is the web's alone: a press's scale, a
hover's lift, the washes a control's own colour is mixed in at (hover,
press, a picked row), and the layered shadows (float, raised, overlay),
each with its night value under $extensions. iOS and Android draw their
system's own states and depth, so only tokens.css carries these.
"""

EXT = "app.wingtipmaps"
WASHES = ("hover", "press", "selected")


def shadow_css(layers):
    """A W3C shadow token (one layer or a list) as box-shadow's value."""
    layers = layers if isinstance(layers, list) else [layers]

    def px(v):
        return "0" if v == 0 else "%gpx" % v

    def colour(hex8):
        r, g, b, a = (int(hex8[i : i + 2], 16) for i in (1, 3, 5, 7))
        return "rgb(%d %d %d / %s)" % (r, g, b, ("%.3f" % (a / 255)).rstrip("0").rstrip("."))

    return ", ".join(
        "%s %s %s %s %s" % (px(s["offsetX"]), px(s["offsetY"]), px(s["blur"]), px(s["spread"]), colour(s["color"])) for s in layers
    )


def css(group):
    """The group's declarations by day (for :root) and at night (.dark)."""
    shadows = {k: t for k, t in group.items() if t.get("$type") == "shadow"}
    day = [("feel-press-scale", "%g" % group["press-scale"]["$value"]), ("feel-lift", "%gpx" % group["lift"]["$value"])]
    day += [("feel-%s" % k, "%g%%" % (group[k]["$value"] * 100)) for k in WASHES]
    day += [("depth-%s" % k, shadow_css(t["$value"])) for k, t in shadows.items()]
    night = [("depth-%s" % k, shadow_css(t["$extensions"][EXT]["dark"])) for k, t in shadows.items()]
    return day, night
