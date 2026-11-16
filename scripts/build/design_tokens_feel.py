"""The feel tokens as the web's custom properties, for design_tokens.py.

design/tokens.json's feel group is the web's alone: the layered shadows
of its own surfaces over the chart (float, overlay, card, sheet, mark)
and the hairline ring,
each with its night value under $extensions. Stock components keep their
own states and shadows, and iOS and Android draw their system's own depth,
so only tokens.css carries these.
"""

EXT = "app.wingtipmaps"


def shadow_css(layers):
    """A W3C shadow token (one layer or a list) as box-shadow's value."""
    layers = layers if isinstance(layers, list) else [layers]

    def px(v):
        return "0" if v == 0 else "%gpx" % v

    def colour(hex8):
        # A look's own colour by its custom property ("--border"), so the
        # shadow follows the look and the night as that colour does.
        if hex8.startswith("--"):
            return "var(%s)" % hex8
        r, g, b, a = (int(hex8[i : i + 2], 16) for i in (1, 3, 5, 7))
        return "rgb(%d %d %d / %s)" % (r, g, b, ("%.3f" % (a / 255)).rstrip("0").rstrip("."))

    return ", ".join(
        "%s %s %s %s %s" % (px(s["offsetX"]), px(s["offsetY"]), px(s["blur"]), px(s["spread"]), colour(s["color"])) for s in layers
    )


def css(group):
    """The group's declarations by day (for :root) and at night (.dark)."""
    shadows = {k: t for k, t in group.items() if t.get("$type") == "shadow"}
    day = [("depth-%s" % k, shadow_css(t["$value"])) for k, t in shadows.items()]
    night = [("depth-%s" % k, shadow_css(t["$extensions"][EXT]["dark"])) for k, t in shadows.items()]
    return day, night
