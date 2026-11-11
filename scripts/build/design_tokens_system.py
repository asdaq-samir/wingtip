"""The phones' own colours (design/tokens.json color.system) and the
Native look that is made of them, for scripts/build/design_tokens.py.

A system colour is a name each phone resolves at run time, never a hex:
iOS's UIColor (systemBlue, label) and Material 3's ColorScheme role
(primary, onSurface), which Material You fills from the wallpaper. A look
token aliases one as {color.system.<name>}; this module writes that alias
out in each phone's idiom. The web's Native is shadcn's stock theme by
value (color.look.native.web), so it names none. Standard library only."""

import re
from collections import namedtuple

from design_tokens_colour import rgba

EXT = "app.wingtipmaps"
ALIAS = re.compile(r"^\{color\.system\.([\w-]+)\}$")

# A system colour in a resolved scheme: its token's name, and each
# phone's word for it.
SystemRef = namedtuple("SystemRef", "name ios android")


def ref(tree, value):
    """The SystemRef an alias names, or None where the value is not one."""
    m = ALIAS.match(value) if isinstance(value, str) else None
    if not m:
        return None
    ext = tree["color"]["system"][m.group(1)]["$extensions"][EXT]
    return SystemRef(m.group(1), ext["ios"], ext["android"])


def colour(tree, value):
    """A resolved scheme's colour: a SystemRef for a system colour, else
    the colour's sRGB."""
    return ref(tree, value) or rgba(value)


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
