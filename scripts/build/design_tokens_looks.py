"""Sunlight, its night and Increase Contrast over every look, and each
look's swatch, for scripts/build/design_tokens.py. Standard library only.

Sunlight is white by day only: at night a white sheet would undo the
pilot's dark adaptation (AIM 8-1-6, Vision in Flight), so the night keeps
the look's own grounds and takes only sunlight's lift of the grey words
and the edges (color.theme.sunlight-night). The device's Increase Contrast
(prefers-contrast: more) takes the same lift, by day sunlight's own grey
words and edges, never its white ground (the themes audit, 2026-11-27)."""

import json

# What Increase Contrast takes from sunlight by day: the grey words and the edges.
CONTRAST_KEYS = ("muted-foreground", "border", "input")


def css_block(selector, decls):
    lines = ["%s {" % selector]
    lines += ["  --%s: %s;" % (k, v) for k, v in decls]
    lines.append("}")
    return "\n".join(lines)


def media_block(query, blocks):
    inner = "\n\n".join("  " + b.replace("\n", "\n  ") for b in blocks)
    return "@media %s {\n%s\n}" % (query, inner)


def sun_and_contrast(decls):
    """The stylesheet's last blocks, after every look's, so they win at
    the looks' weight: sunlight by day, sunlight at night, then Increase
    Contrast by day and at night."""
    night = decls("color", "theme", "sunlight-night")
    return [
        "/* Sunlight by day, over every look: the white ground. */\n"
        + css_block(':root[data-chart-light="bright"]:not(.dark)', decls("color", "theme", "sunlight")),
        "/* Sunlight at night: the look's own dark ground kept (AIM 8-1-6), its grey words\n"
        "   and edges lifted. */\n" + css_block(':root.dark[data-chart-light="bright"]', night),
        "/* Increase Contrast (prefers-contrast: more), over every look: sunlight's grey\n"
        "   words and edges by day, sunlight's night lift at night, never its white ground. */\n"
        + media_block(
            "(prefers-contrast: more)",
            [
                css_block(":root[data-brand]:not(.dark)", [d for d in decls("color", "theme", "sunlight") if d[0] in CONTRAST_KEYS]),
                css_block(":root.dark[data-brand]", night),
            ],
        ),
    ]


def swatch_ts(tree, theme_group, lookup, alias, native_web, ts_obj):
    """tokens.ts's LOOK_SWATCH: each look's swatch in the Theme menu (lib/brand),
    by day and at night."""
    return (
        "/** Each look's tint on its sheet by day and at night, for its swatch in the Theme menu. */\n"
        "export const LOOK_SWATCH = %s as const;" % ts_obj(swatches(tree, theme_group, lookup, alias, native_web))
    )


def swatches(tree, theme_group, lookup, alias, native_web):
    """Each look's tint and sheet as the web's cascade gives them, by day
    (light) and at night (dark): the look's own token, else the theme's,
    an alias followed. Native's are its stock primary and background."""

    def scheme(mode):
        theme = theme_group(tree, "color", "theme", mode)
        own = {
            "wingtip": {},
            "cockpit": theme_group(tree, "color", "look", "cockpit", mode),
            "ink": theme_group(tree, "color", "look", "ink", mode),
            "native": theme_group(tree, *native_web, mode),
        }

        def value(look, key):
            v = (own[look].get(key) or theme[key])["$value"]
            while alias.match(v):
                v = lookup(tree, alias.match(v).group(1))["$value"]
            return json.dumps(v)

        keys = {look: ("primary", "background") if look == "native" else ("tint", "sheet") for look in own}
        return {look: "{ tint: %s, ground: %s }" % (value(look, keys[look][0]), value(look, keys[look][1])) for look in own}

    day, night = scheme("light"), scheme("dark")
    return {look: "{ day: %s, night: %s }" % (day[look], night[look]) for look in day}
