"""Material 3 Expressive's springs (design/tokens.json's spring group),
written into the Android app's Tokens.kt alone: the iPhone and the web
keep their own curves, and the docked sheet its ease-out (decision 0018).
"""


def kotlin(springs, pascal):
    """A damping ratio and a stiffness each, as Compose's spring() takes
    them, under one object."""
    lines = [
        "/** A spring: Compose's spring() damping ratio and stiffness. */",
        "@Immutable",
        "data class WingtipSpringSpec(val dampingRatio: Float, val stiffness: Float)",
        "",
        "/** Material 3 Expressive's springs, the motion scheme's. */",
        "object WingtipSpring {",
    ]
    for k, t in springs.items():
        v = t["$value"]
        lines.append("    /** %s */" % t["$description"])
        lines.append("    val %s = WingtipSpringSpec(%gf, %gf)" % (pascal(k), v["dampingRatio"], v["stiffness"]))
    lines += ["}", ""]
    return lines
