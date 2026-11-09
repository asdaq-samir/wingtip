"""The haptic tokens in each platform's own terms, for design_tokens.py.

design/tokens.json's haptic group names one tap per key action (an
altitude set, Direct To, a warning, a sheet detent); each token maps it
under $extensions to an iOS SensoryFeedback, an Android
HapticFeedbackConstants name (one from API 30 with its fallback below
that, as minSdk is 26) and a web navigator.vibrate pattern. Each function
takes the group's tokens, name to token, and the generator's camelCase.
"""

import json
import re

EXT = "app.wingtipmaps"

# Each haptic's iOS name, as SwiftUI's SensoryFeedback writes it.
IOS = {
    "selection": ".selection",
    "success": ".success",
    "warning": ".warning",
    "error": ".error",
    "impact-light": ".impact(weight: .light)",
    "impact-medium": ".impact(weight: .medium)",
    "impact-heavy": ".impact(weight: .heavy)",
}

# What Tokens.kt imports for WingtipHaptic.
KOTLIN_IMPORTS = ["import android.os.Build", "import android.view.HapticFeedbackConstants"]


def _on(token, name):
    return token["$extensions"][EXT][name]


def ts(haptics, camel):
    body = "".join("  %s: %s,\n" % (camel(k), json.dumps(_on(t, "web"))) for k, t in haptics.items())
    return (
        "/** The taps felt on a key action: navigator.vibrate patterns in milliseconds (lib/haptics plays them). */\n"
        "export const HAPTIC = {\n%s} as const;" % body
    )


def swift(haptics, camel):
    L = [
        "/// The taps felt on a key action, as SwiftUI's sensory feedback",
        "/// (`.sensoryFeedback(WingtipHaptic.altitude, trigger:)`); the system",
        "/// leaves them out where the pilot has turned system haptics off.",
        "enum WingtipHaptic {",
    ]
    for k, t in haptics.items():
        if "$description" in t:
            L.append("    /// %s" % t["$description"])
        L.append("    static let %s: SensoryFeedback = %s" % (camel(k), IOS[_on(t, "ios")]))
    return L + ["}", ""]


def kotlin(haptics):
    L = [
        "/** The taps felt on a key action, as View.performHapticFeedback's constants; one",
        " *  from API 30 has its fallback below that. */",
        "object WingtipHaptic {",
    ]
    for k, t in haptics.items():
        a, name = _on(t, "android"), re.sub("-", "_", k).upper()
        if "$description" in t:
            L.append("    /** %s */" % t["$description"].replace("*/", "* /"))
        if "since" in a:
            L.append(
                "    val %s: Int get() = if (Build.VERSION.SDK_INT >= %d) HapticFeedbackConstants.%s else HapticFeedbackConstants.%s"
                % (name, a["since"], a["constant"], a["fallback"])
            )
        else:
            L.append("    const val %s = HapticFeedbackConstants.%s" % (name, a["constant"]))
    return L + ["}", ""]
