package app.wingtipmaps.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.isSpecified
import app.wingtipmaps.android.design.generated.WingtipPalette
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.design.generated.WingtipTypography

/** The scheme's own palette, for the roles Material does not name: a
 *  caution, a go, the course's magenta, the inks. */
val LocalWingtipPalette = staticCompositionLocalOf { WingtipPalettes.Light }

/**
 * A Wingtip palette (design/tokens.json, generated into Tokens.kt) in
 * Material 3's roles, so a stock component wears the same tint, grounds
 * and words as the web and the iPhone: the sheet's ground is the surface,
 * a card the containers, the muted grey the high containers and the
 * variant, the tint primary, the course tertiary, the destructive ink
 * the error. A container colour the palette gives (the ink look's) wins
 * over Material's own.
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

/**
 * Material 3 in Wingtip's own palette, light or dark with the system: the
 * same tint and grounds as the web app and the iPhone (the owner,
 * 2026-11-09: one design language, each platform in its idiom), rather
 * than the wallpaper's Material You colours, which put a tappable thing
 * in whatever colour the wallpaper was.
 */
@Composable
fun WingtipTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val palette = if (dark) WingtipPalettes.Dark else WingtipPalettes.Light
    CompositionLocalProvider(LocalWingtipPalette provides palette) {
        MaterialTheme(colorScheme = palette.materialScheme(dark), typography = WingtipTypography, content = content)
    }
}
