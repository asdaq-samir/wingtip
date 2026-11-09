package app.wingtipmaps.android.strip

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipPalette
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipTypography
import app.wingtipmaps.android.ui.LocalWingtipPalette
import app.wingtipmaps.android.ui.materialScheme

/**
 * The Chart ink look (the owner's canvas, 2026-11-04: "I like chart ink
 * and glass cockpit only"), as a Material 3 colour scheme: the app in the
 * FAA sectional's own ink. By day a paper ground under white cards; the
 * chart's magenta for the route and an ident at the head, its brown for a
 * checkpoint's mark, its green for a field; the app's blue tint by day,
 * a light teal at night with the ground's dark words on it. Every value
 * is design/tokens.json's color.look.ink (WingtipPalettes.InkLight and
 * InkDark), the same as the web's and the iPhone's; the phone's own
 * Material You colours are left aside, since the ink is the identity.
 */
object ChartInk {
    val light: ColorScheme = WingtipPalettes.InkLight.materialScheme(dark = false)
    val dark: ColorScheme = WingtipPalettes.InkDark.materialScheme(dark = true)

    /** The inks beyond Material's roles, for the scheme. */
    fun inks(p: WingtipPalette): InkColors = InkColors(
        magenta = p.inkMagenta, brown = p.inkBrown, field = p.inkField,
        caution = p.caution, cautionInk = p.cautionInk, go = p.go, goInk = p.goInk,
        stopInk = p.destructiveInk, flown = WingtipColors.Strip.Flown,
    )
}

/** The inks beyond Material's roles: the course's magenta, a checkpoint's
 *  brown, a field's green, a caution and a go as marks and as words. */
@Immutable
data class InkColors(
    val magenta: Color,
    val brown: Color,
    val field: Color,
    val caution: Color,
    val cautionInk: Color,
    val go: Color,
    val goInk: Color,
    val stopInk: Color,
    val flown: Color,
) {
    /** A finding's colour as words, 4.5:1 and more on a card. */
    fun words(finding: Finding, muted: Color): Color = when (finding) {
        Finding.OK -> goInk
        Finding.CAUTION -> cautionInk
        Finding.STOP -> stopInk
        Finding.UNKNOWN, Finding.PENDING -> muted
    }
}

val LocalInk = staticCompositionLocalOf { ChartInk.inks(WingtipPalettes.InkLight) }

/** The strip's shapes, from the ink look's 12-point base as the web's
 *  are (a chip's 0.6 of it, a button's 0.8): 18-point corners on a card,
 *  as the canvas draws them, and an alert's 28; a chip stays Material's
 *  own capsule. */
val StripShapes = Shapes(
    extraSmall = RoundedCornerShape(WingtipRadius.Ink * 0.6f),
    small = RoundedCornerShape(WingtipRadius.Ink * 0.8f),
    medium = RoundedCornerShape(WingtipRadius.Ink),
    large = RoundedCornerShape(WingtipRadius.Card),
    extraLarge = RoundedCornerShape(WingtipRadius.Dialog),
)

/** The strip layout's theme: the ink scheme by day or night with the
 *  system, over whatever theme the app's root set. */
@Composable
fun StripTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val palette = if (dark) WingtipPalettes.InkDark else WingtipPalettes.InkLight
    val ink = ChartInk.inks(palette)
    CompositionLocalProvider(LocalInk provides ink, LocalWingtipPalette provides palette) {
        MaterialTheme(
            colorScheme = if (dark) ChartInk.dark else ChartInk.light,
            shapes = StripShapes,
            typography = WingtipTypography,
            content = content,
        )
    }
}
