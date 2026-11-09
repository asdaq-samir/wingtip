package app.wingtipmaps.android.ui

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.platform.LocalContext
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipPalette
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipTypography
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import androidx.core.content.edit

/**
 * The app's looks, as Setup's Theme offers them on every app: Wingtip,
 * the brand's own blue, first and the default (the owner, 2026-11-09);
 * Glass Cockpit and Chart ink beside it. Each is a pair of palettes from
 * design/tokens.json, by day and by night.
 */
enum class Look(val key: String, val label: String) {
    WINGTIP("wingtip", "Wingtip"),
    COCKPIT("cockpit", "Glass Cockpit"),
    INK("ink", "Chart Ink");

    fun palette(dark: Boolean): WingtipPalette = when (this) {
        WINGTIP -> if (dark) WingtipPalettes.Dark else WingtipPalettes.Light
        COCKPIT -> if (dark) WingtipPalettes.CockpitDark else WingtipPalettes.CockpitLight
        INK -> if (dark) WingtipPalettes.InkDark else WingtipPalettes.InkLight
    }

    companion object {
        fun of(key: String?): Look = entries.firstOrNull { it.key == key } ?: WINGTIP
    }
}

/** The look picked, kept under the web app's key "look" and held in one
 *  flow, so the theme and Setup's Theme row see the same value at once. */
object LookPreference {
    private const val KEY = "look"
    private val state = MutableStateFlow<Look?>(null)

    fun flow(context: Context): StateFlow<Look?> {
        if (state.value == null) {
            state.value = Look.of(context.getSharedPreferences("wingtip", Context.MODE_PRIVATE).getString(KEY, null))
        }
        return state.asStateFlow()
    }

    fun set(context: Context, look: Look) {
        context.getSharedPreferences("wingtip", Context.MODE_PRIVATE).edit { putString(KEY, look.key) }
        state.value = look
    }
}

@Composable
fun rememberLook(): State<Look?> = LookPreference.flow(LocalContext.current).collectAsState()

/** The scheme's own palette, for the roles Material does not name: a
 *  caution, a go, the course's magenta, the inks. */
val LocalWingtipPalette = staticCompositionLocalOf { WingtipPalettes.Light }

/** The chart's inks beyond Material's roles: the course's magenta, a
 *  checkpoint's brown, a field's green, a caution and a go as marks and
 *  as words. A look with no inks of its own takes Chart ink's, which
 *  are the sectional's whatever the look. */
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
    companion object {
        fun of(p: WingtipPalette, dark: Boolean): InkColors {
            val chart = if (dark) WingtipPalettes.InkDark else WingtipPalettes.InkLight
            fun Color.or(other: Color) = takeIf { it.isSpecified } ?: other
            return InkColors(
                magenta = p.inkMagenta.or(chart.inkMagenta), brown = p.inkBrown.or(chart.inkBrown), field = p.inkField.or(chart.inkField),
                caution = p.caution, cautionInk = p.cautionInk, go = p.go, goInk = p.goInk,
                stopInk = p.destructiveInk, flown = WingtipColors.Strip.Flown,
            )
        }
    }
}

val LocalInk = staticCompositionLocalOf { InkColors.of(WingtipPalettes.Light, dark = false) }

/**
 * A Wingtip palette in Material 3's roles, so a stock component wears the
 * same tint, grounds and words as the web and the iPhone: the sheet's
 * ground is the surface, a card the containers, the muted grey the high
 * containers and the variant, the tint primary, the course tertiary, the
 * destructive ink the error. A container colour the palette gives (the
 * ink look's) wins over Material's own.
 */
fun WingtipPalette.materialScheme(dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = primary,
        onPrimary = primaryForeground,
        primaryContainer = primaryContainer.takeIf { it.isSpecified } ?: base.primaryContainer,
        onPrimaryContainer = onPrimaryContainer.takeIf { it.isSpecified } ?: base.onPrimaryContainer,
        secondary = mutedForeground,
        onSecondary = primaryForeground,
        secondaryContainer = secondary,
        onSecondaryContainer = secondaryForeground,
        tertiary = course,
        onTertiary = primaryForeground,
        background = background,
        onBackground = foreground,
        surface = sheet,
        onSurface = foreground,
        surfaceVariant = muted,
        onSurfaceVariant = mutedForeground,
        surfaceContainerLowest = card,
        surfaceContainerLow = card,
        surfaceContainer = card,
        surfaceContainerHigh = muted,
        surfaceContainerHighest = muted,
        outline = outline.takeIf { it.isSpecified } ?: border,
        outlineVariant = outlineVariant.takeIf { it.isSpecified } ?: border,
        error = destructiveInk,
        onError = primaryForeground,
    )
}

/** The shapes, from the tokens' radii as the web's are (a chip's 0.6 of
 *  the base, a button's 0.8): 18-point corners on a card, 28 on a dialog. */
val WingtipShapes = Shapes(
    extraSmall = RoundedCornerShape(WingtipRadius.Ink * 0.6f),
    small = RoundedCornerShape(WingtipRadius.Ink * 0.8f),
    medium = RoundedCornerShape(WingtipRadius.Ink),
    large = RoundedCornerShape(WingtipRadius.Card),
    extraLarge = RoundedCornerShape(WingtipRadius.Dialog),
)

/**
 * The one Wingtip Material theme, for both layouts: the look picked in
 * Setup (Wingtip by default), light or dark with the system, its type
 * roles and shapes from the tokens. Material You stays off: the brand's
 * blue is the tint, where the wallpaper's colours would put a tappable
 * thing in whatever colour the wallpaper was.
 */
@Composable
fun WingtipTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val look = rememberLook().value ?: Look.WINGTIP
    val palette = look.palette(dark)
    CompositionLocalProvider(LocalWingtipPalette provides palette, LocalInk provides InkColors.of(palette, dark)) {
        MaterialTheme(
            colorScheme = palette.materialScheme(dark),
            typography = WingtipTypography,
            shapes = WingtipShapes,
            content = content,
        )
    }
}
