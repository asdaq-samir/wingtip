package app.wingtipmaps.android.ui

import android.app.Activity
import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Settings' Appearance, the web's four (the owner, 2026-11-13: Chart at
 * Night folded into it): the phone's own light or dark, Light, Dark --
 * which dims the chart with the screen, the night's default -- and Dark +
 * Bright, dark with the chart as printed. `key` is what the "wingtip"
 * store keeps.
 */
enum class Appearance(val key: String) {
    SYSTEM("system"), LIGHT("light"), DARK("dark"), DARK_BRIGHT("dark-bright");

    /** Whether the screen is dark, the phone's own where it is followed. */
    fun dark(systemDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemDark
        LIGHT -> false
        DARK, DARK_BRIGHT -> true
    }

    /** Whether the chart is dimmed (MapStyle.chartPaint): dark but Dark + Bright. */
    fun chartDimmed(systemDark: Boolean): Boolean = dark(systemDark) && this != DARK_BRIGHT

    companion object {
        fun of(key: String?): Appearance = entries.firstOrNull { it.key == key } ?: SYSTEM
    }
}

/** The appearance picked, kept as the look is (LookPreference), in one
 *  flow, so the theme, the map and Settings see the same value at once. */
object AppearancePreference {
    private val KEY = stringPreferencesKey("appearance")
    private val state = MutableStateFlow<Appearance?>(null)

    fun flow(context: Context): StateFlow<Appearance?> {
        if (state.value == null) state.value = Appearance.of(Kept.of(context, "wingtip")[KEY])
        return state.asStateFlow()
    }

    fun set(context: Context, appearance: Appearance) {
        Kept.of(context, "wingtip").edit { it[KEY] = appearance.key }
        state.value = appearance
    }
}

@Composable
fun rememberAppearance(): State<Appearance?> = AppearancePreference.flow(LocalContext.current).collectAsState()

/** Whether the screen is dark and the chart dimmed, as the theme decided
 *  them (WingtipTheme), for what draws below it: the map's paint. */
class Shade(val dark: Boolean, val chartDimmed: Boolean)

val LocalShade = staticCompositionLocalOf { Shade(dark = false, chartDimmed = false) }

/** The appearance as the theme reads it, the phone's dark asked once. */
@Composable
internal fun rememberShade(): Shade {
    val system = isSystemInDarkTheme()
    val picked = rememberAppearance().value ?: Appearance.SYSTEM
    return Shade(picked.dark(system), picked.chartDimmed(system))
}

/** The status and navigation bars' icons light on a dark screen and dark
 *  on a light one, whatever the phone's own setting, the stock
 *  WindowInsetsControllerCompat's switches. */
@Composable
internal fun SystemBarsFollow(dark: Boolean) {
    val view = LocalView.current
    if (view.isInEditMode) return
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
}
