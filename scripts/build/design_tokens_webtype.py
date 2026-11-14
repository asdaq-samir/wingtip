"""The web's text roles as Tailwind classes (lib/tokens TYPE_CLASS), for
scripts/build/design_tokens.py. Standard library only."""

EXT = "app.wingtipmaps"


def rem(px):
    return ("%.4f" % (px / 16)).rstrip("0").rstrip(".") + "rem"


TAILWIND_SIZES = {12: "text-xs", 14: "text-sm", 16: "text-base", 18: "text-lg", 20: "text-xl"}


def fixed(role):
    """Whether a role's size is the same with a mouse as to a finger, and
    so set through its own variables (--type-*, --lead-*), which the
    Native look sets to Tailwind's stock steps."""
    v = role["$value"]
    mouse = role.get("$extensions", {}).get(EXT, {}).get("web", {}).get("mouse")
    return "fontSize" in v and "lineHeight" in v and mouse in (None, v["fontSize"])


def web_class(name, role):
    """A role's Tailwind classes, as lib/text.ts uses them: the role's own
    size and leading variables where the mouse's is the same as the
    touch's (fixed, above); else the mouse's
    named size (whose leading index.css sets on a touch screen) with the
    touch size beside it. The face, case, spacing and digits come with
    the label, word and figure, and their weight with them; the other
    roles leave the weight to the words they are on."""
    v = role["$value"]
    web = role.get("$extensions", {}).get(EXT, {}).get("web", {})
    out = []
    styled = "textCase" in v or v.get("tabular")
    if "{font.display}" == v.get("fontFamily"):
        out.append("font-display")
    if "fontSize" in v:
        size, lead = v["fontSize"], v.get("lineHeight")
        mouse = web.get("mouse")
        if fixed(role):
            out.append("text-(length:--type-%s)" % name)
            out.append("leading-(--lead-%s)" % name)
        elif mouse is None or mouse == size:
            out.append("text-(length:--type-%s)" % name)
        else:
            out.append(TAILWIND_SIZES.get(mouse, "text-[%s]" % rem(mouse)))
            # Capped in px where the role says (a chip over the map), so
            # it grows with the text size only so far.
            cap = web.get("maxPx")
            out.append("pointer-coarse:text-[%s]" % ("min(%s,%gpx)" % (rem(size), cap) if cap else rem(size)))
            if web.get("touchLeading") and lead:
                out.append("pointer-coarse:leading-[%s]" % rem(lead))
    if styled:
        out.append({400: "font-normal", 500: "font-medium", 600: "font-semibold", 700: "font-bold"}[v["fontWeight"]])
    if v.get("textCase") == "uppercase":
        # The Native look's words as they are, not in capitals (index.css's native variant).
        out += ["uppercase", "native:normal-case"]
    if "letterSpacing" in v:
        out += ["tracking-[%gem]" % v["letterSpacing"], "native:tracking-normal"]
    if v.get("tabular"):
        out.append("tabular-nums")
    return " ".join(out)
