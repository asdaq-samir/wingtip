package app.wingtipmaps.android.ui

import android.content.Context
import android.os.Build
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
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
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.design.LocalNative
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipPalette
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.design.generated.WingtipRadius
import app.wingtipmaps.android.design.generated.WingtipTypography
import app.wingtipmaps.android.design.generated.nativePalette
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The app's looks, as Setup's Theme offers them on every app: Wingtip,
 * the brand's own blue, first and the default (the owner, 2026-11-09);
 * Glass Cockpit and Chart ink beside it; and Native, Android's own
 * Material You (2026-11-10). Each is a pair of palettes from
 * design/tokens.json, by day and by night; Native's names system roles,
 * which nativeScheme and nativePalette fill from the phone.
 */
enum class Look(val key: String, val label: String) {
    WINGTIP("wingtip", "Wingtip"),
    COCKPIT("cockpit", "Glass Cockpit"),
    INK("ink", "Chart Ink"),
    NATIVE("native", "Native");

    /** The look's palette; Native's system roles are unspecified here
     *  until nativePalette fills them from a Material scheme. */
    fun palette(dark: Boolean): WingtipPalette = when (this) {
        WINGTIP -> if (dark) WingtipPalettes.Dark else WingtipPalettes.Light
        COCKPIT -> if (dark) WingtipPalettes.CockpitDark else WingtipPalettes.CockpitLight
        INK -> if (dark) WingtipPalettes.InkDark else WingtipPalettes.InkLight
        NATIVE -> if (dark) WingtipPalettes.NativeDark else WingtipPalettes.NativeLight
    }

    companion object {
        fun of(key: String?): Look = entries.firstOrNull { it.key == key } ?: WINGTIP
    }
}

/** The look picked, kept under the web app's key "look" and held in one
 *  flow, so the theme and Setup's Theme row see the same value at once. */
object LookPreference {
    private val KEY = stringPreferencesKey("look")
    private val state = MutableStateFlow<Look?>(null)

    fun flow(context: Context): StateFlow<Look?> {
        if (state.value == null) {
            state.value = Look.of(Kept.of(context, "wingtip")[KEY])
        }
        return state.asStateFlow()
    }

    fun set(context: Context, look: Look) {
        Kept.of(context, "wingtip").edit { it[KEY] = look.key }
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
 * destructive ink the error. A Material role the palette gives (the
 * tokens' color.material: the Wingtip look's stepped containers, its
 * 3:1 outline and its night primary, the owner's decision of 2026-11-10;
 * the ink look's containers) wins over the mapping.
 */
fun WingtipPalette.materialScheme(dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    fun Color.or(other: Color) = takeIf { it.isSpecified } ?: other
    return base.copy(
        primary = materialPrimary.or(primary),
        onPrimary = materialOnPrimary.or(primaryForeground),
        primaryContainer = primaryContainer.or(base.primaryContainer),
        onPrimaryContainer = onPrimaryContainer.or(base.onPrimaryContainer),
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
        surfaceVariant = surfaceVariant.or(muted),
        onSurfaceVariant = mutedForeground,
        surfaceContainerLowest = surfaceContainerLowest.or(card),
        surfaceContainerLow = surfaceContainerLow.or(card),
        surfaceContainer = surfaceContainer.or(card),
        surfaceContainerHigh = surfaceContainerHigh.or(muted),
        surfaceContainerHighest = surfaceContainerHighest.or(muted),
        outline = outline.or(border),
        outlineVariant = outlineVariant.or(border),
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
 * The Native look's Material scheme: Material You's, from the wallpaper,
 * on Android 12 (API 31) and later, which made dynamic colour; Material's
 * own baseline before it.
 */
fun nativeScheme(context: Context, dark: Boolean): ColorScheme = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    dark -> darkColorScheme()
    else -> lightColorScheme()
}

/** What a look gives Material: its scheme, type scale and shapes. */
class LookTheme(val colorScheme: ColorScheme, val typography: Typography, val shapes: Shapes, val native: Boolean)

/**
 * A look's Material theme. The brand looks: the palette in Material's
 * roles, the tokens' type roles (their emphasized twins included) and
 * shapes. Native (`nativeScheme` given): Material as it comes out of the
 * box (the owner, 2026-11-10: "Native means how they come out of the box,
 * look and behavior wise"), the scheme whole and Material's own
 * Typography() and Shapes(), nothing of the tokens'.
 */
fun lookTheme(look: Look, dark: Boolean, nativeScheme: ColorScheme?): LookTheme =
    if (look == Look.NATIVE && nativeScheme != null) {
        LookTheme(nativeScheme, Typography(), Shapes(), native = true)
    } else {
        LookTheme(look.palette(dark).materialScheme(dark), WingtipTypography, WingtipShapes, native = false)
    }

/**
 * The one Wingtip Material theme, for both layouts, in the look picked in
 * Settings (Wingtip by default), light or dark by its Appearance. The brand
 * looks wear Material 3 Expressive's own theme (MaterialExpressiveTheme),
 * so every stock component -- switches, tabs, menus, sliders, sheets,
 * buttons -- moves on Google's expressive motion scheme, its springs.
 * Native is a plain MaterialTheme: its default scheme (Material You's
 * from the wallpaper on Android 12 and later, the baseline before), its
 * default type, shapes and motion, and LocalNative set, so the app's own
 * shapes and haptics stand aside (design/Native). Material You is the
 * Native look's alone: in the others the look's tint is the tint, where
 * the wallpaper's colours would put a tappable thing in whatever colour
 * the wallpaper was. In every look the states and the chart's inks stay
 * the theme's (LocalWingtipPalette, LocalInk, nativePalette in Native),
 * being aviation's: the map's content and a caution's meaning, not the
 * components' chrome. Under Remove animations nothing springs: Compose
 * runs every animation on the window's animator duration scale, which
 * that switch sets to 0, so each finishes at once.
 */
@Composable
fun WingtipTheme(content: @Composable () -> Unit) {
    // Light or dark by Settings' Appearance, the phone's own by default.
    val shade = rememberShade()
    val dark = shade.dark
    SystemBarsFollow(dark)
    val look = rememberLook().value ?: Look.WINGTIP
    val scheme = if (look == Look.NATIVE) nativeScheme(LocalContext.current, dark) else null
    val theme = lookTheme(look, dark, scheme)
    val palette = scheme?.let { nativePalette(it, dark) } ?: look.palette(dark)
    CompositionLocalProvider(
        LocalWingtipPalette provides palette,
        LocalInk provides InkColors.of(palette, dark),
        LocalNative provides theme.native,
        LocalShade provides shade,
    ) {
        if (theme.native) {
            MaterialTheme(colorScheme = theme.colorScheme, content = content)
        } else {
            MaterialExpressiveTheme(
                colorScheme = theme.colorScheme,
                motionScheme = MotionScheme.expressive(),
                typography = theme.typography,
                shapes = theme.shapes,
                content = content,
            )
        }
    }
}
