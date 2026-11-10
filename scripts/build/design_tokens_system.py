"""The platforms' own colours (design/tokens.json color.system) and the
Native look that is made of them, for scripts/build/design_tokens.py.

A system colour is a name each platform resolves at run time, never a
hex: the web's CSS system colour (Canvas, LinkText, AccentColor), iOS's
UIColor (systemBlue, label) and Material 3's ColorScheme role (primary,
onSurface), which Material You fills from the wallpaper. A look token
aliases one as {color.system.<name>}; this module writes that alias out
in each platform's idiom. Standard library only."""

import re
from collections import namedtuple

from design_tokens_colour import rgba

EXT = "app.wingtipmaps"
ALIAS = re.compile(r"^\{color\.system\.([\w-]+)\}$")

# A system colour in a resolved scheme: its token's name, and each
# platform's word for it.
SystemRef = namedtuple("SystemRef", "name web fallback ios android")


def ref(tree, value):
    """The SystemRef an alias names, or None where the value is not one."""
    m = ALIAS.match(value) if isinstance(value, str) else None
    if not m:
        return None
    ext = tree["color"]["system"][m.group(1)]["$extensions"][EXT]
    return SystemRef(m.group(1), ext["web"], ext.get("web-fallback"), ext["ios"], ext["android"])


def colour(tree, value):
    """A resolved scheme's colour: a SystemRef for a system colour, else
    the colour's sRGB."""
    return ref(tree, value) or rgba(value)


def css(tree, selector, decls, block):
    """The Native look's blocks for tokens.css: each system colour as the
    web's keyword, a browser without one (Chromium has no AccentColor)
    taking its fallback first and the keyword only under @supports."""
    plain, supported = [], []
    for k, v in decls:
        r = ref(tree, v)
        if r and r.fallback:
            plain.append((k, r.fallback))
            supported.append((k, r.web))
        else:
            plain.append((k, r.web if r else v))
    out = [block(selector, plain)]
    for keyword in sorted({ref(tree, v).web for _, v in decls if ref(tree, v) and ref(tree, v).fallback}):
        rows = [(k, v) for k, v in supported if v == keyword]
        inner = block(selector, rows).replace("\n", "\n  ")
        out.append("@supports (color: %s) {\n  %s\n}" % (keyword, inner))
    return out


def swift(c):
    """A system colour as Swift writes it: the UIColor, dynamic for the
    appearance by itself."""
    return "UIColor.%s" % c.ios


def kotlin(sch, names, camel):
    """The Native palette on Android: Material You's roles (the scheme the
    theme made, dynamic from the wallpaper or Material's baseline) where
    the tokens name a system colour, the theme's own for the rest."""
    light, dark = sch["nativeLight"], sch["nativeDark"]
    L = [
        "/** The Native look's palette: Material's own roles (`scheme`, Material You's from the",
        " *  wallpaper or Material's baseline) where design/tokens.json names a system colour",
        " *  (color.system), the theme's own for the rest: the states, the course, the inks. */",
        "fun nativePalette(scheme: ColorScheme, dark: Boolean): WingtipPalette {",
        "    val p = if (dark) WingtipPalettes.NativeDark else WingtipPalettes.NativeLight",
        "    return WingtipPalette(",
    ]
    for n in names:
        lc, dc = light.get(n), dark.get(n)
        if isinstance(lc, SystemRef) and isinstance(dc, SystemRef) and lc.android == dc.android:
            expr = "scheme.%s" % lc.android
        elif isinstance(lc, SystemRef) or isinstance(dc, SystemRef):

            def one(c, n=n):
                return "scheme.%s" % c.android if isinstance(c, SystemRef) else ("p.%s" % camel(n) if c else "Color.Unspecified")

            expr = "if (dark) %s else %s" % (one(dc), one(lc))
        else:
            expr = "p.%s" % camel(n)
        L.append("        %s = %s," % (camel(n), expr))
    L += ["    )", "}", ""]
    return L
