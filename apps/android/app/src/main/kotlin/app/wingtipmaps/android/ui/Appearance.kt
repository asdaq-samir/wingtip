package app.wingtipmaps.android.ui

import android.app.Activity
import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The Map card's Appearance, the web's three: the phone's own light or
 * dark, Light and Dark. How far the chart is dimmed is the Map card's
 * Dimmer, one for each appearance (ChartLook), where Dark + Bright was the
 * chart undimmed under the dark screen until the web's 2026-11-18 change;
 * a kept one is Dark with a dark Dimmer of 0 (ChartLookPreference.migrate).
 * `key` is what the "wingtip" store keeps.
 */
enum class Appearance(val key: String) {
    SYSTEM("system"), LIGHT("light"), DARK("dark");

    /** Whether the screen is dark, the phone's own where it is followed. */
    fun dark(systemDark: Boolean): Boolean = when (this) {
        SYSTEM -> systemDark
        LIGHT -> false
        DARK -> true
    }

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
        if (state.value == null) {
            val kept = Kept.of(context, "wingtip")
            ChartLookPreference.migrate(kept)
            state.value = Appearance.of(kept[KEY])
        }
        return state.asStateFlow()
    }

    fun set(context: Context, appearance: Appearance) {
        Kept.of(context, "wingtip").edit { it[KEY] = appearance.key }
        state.value = appearance
        // The launch's window in it too (NightMode).
        NightMode.apply(context, appearance)
    }
}

@Composable
fun rememberAppearance(): State<Appearance?> = AppearancePreference.flow(LocalContext.current).collectAsStateWithLifecycle()

/** Whether the screen is dark, as the theme decided it (WingtipTheme),
 *  and the Map card's Dimmer and Contrast, for what draws below it: the
 *  map's paint and a plate's. */
class Shade(val dark: Boolean, val look: ChartLook = ChartLook())

val LocalShade = staticCompositionLocalOf { Shade(dark = false) }

/** The appearance as the theme reads it, the phone's dark asked once. */
@Composable
internal fun rememberShade(): Shade {
    val system = isSystemInDarkTheme()
    val picked = rememberAppearance().value ?: Appearance.SYSTEM
    return Shade(picked.dark(system), rememberChartLook().value ?: ChartLook())
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
