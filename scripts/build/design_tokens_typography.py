"""The Android app's type roles (Material 3's Typography), for
design_tokens.py: each role the tokens give a Material slot, and its
emphasized twin.

Material 3 Expressive's emphasized roles are each role a weight step
heavier, its size and line height kept, for what leads a screen (a figure
glanced at in flight, the choice made in a group). Material's own
emphasized roles are its sizes in Roboto, so each is written from the
tokens' role rather than left to Material's default.
"""

ANDROID_WEIGHT = {
    400: "FontWeight.Normal",
    500: "FontWeight.Medium",
    600: "FontWeight.SemiBold",
    700: "FontWeight.Bold",
    800: "FontWeight.ExtraBold",
}

EMPHASIZED_WEIGHT = {400: 500, 500: 600, 600: 700, 700: 800}


def kt_style(v, weight):
    """One role as Compose's TextStyle, at `weight`."""
    args = [
        "fontFamily = FontFamily.SansSerif",
        "fontWeight = %s" % ANDROID_WEIGHT[weight],
        "fontSize = %g.sp" % v["fontSize"],
        "lineHeight = %g.sp" % v["lineHeight"],
    ]
    if "letterSpacing" in v:
        args.append("letterSpacing = %g.em" % v["letterSpacing"])
    if v.get("tabular"):
        args.append('fontFeatureSettings = "tnum"')
    return "TextStyle(%s)" % ", ".join(args)


def kotlin(slots):
    """WingtipTypography: `slots` (Material slot to the role's value) and
    each slot's emphasized twin."""
    lines = ["val WingtipTypography = Typography("]
    for slot, v in slots.items():
        lines.append("    %s = %s," % (slot, kt_style(v, v.get("fontWeight", 400))))
    for slot, v in slots.items():
        lines.append("    %sEmphasized = %s," % (slot, kt_style(v, EMPHASIZED_WEIGHT[v.get("fontWeight", 400)])))
    lines += [")", ""]
    return lines
