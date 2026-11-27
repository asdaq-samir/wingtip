package app.wingtipmaps.android.ui

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrightnessHigh
import androidx.compose.material.icons.filled.BrightnessLow
import androidx.compose.material.icons.filled.Contrast
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.map.MapStyle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.roundToInt

/**
 * The chart's Dimmer and Contrast, as the web's Map card has them under
 * Look (lib/map/chartLook; the owner, 2026-11-18: "can we have a dimmer
 * and contrast sliders under sunlight and remove it from the
 * appearance?"): the Dimmer kept apart for light and for dark, Contrast
 * one offset on the look's own. A display's figures, not aviation ones;
 * continuous, so sliders (docs/design/rules.md §147).
 */
data class ChartLook(val dimLight: Float = 0f, val dimDark: Float = NIGHT_DIM, val contrast: Float = 0f) {
    /** The Dimmer for the appearance drawn, within 0 and DIM_MAX. */
    fun dim(dark: Boolean): Float = (if (dark) dimDark else dimLight).coerceIn(0f, DIM_MAX)

    /** The Contrast offset within its ends. */
    val offset: Float get() = contrast.coerceIn(CONTRAST_MIN, CONTRAST_MAX)

    /** The chart's paint with these over the night's or the day's own
     *  (MapStyle.chartPaint, the web's chartPaint): raster-brightness-max
     *  1 less the Dimmer, raster-contrast the look's plus the offset. */
    fun paint(night: Boolean): MapStyle.ChartPaint =
        MapStyle.chartPaint(night).let { it.copy(brightnessMax = 1f - dim(night), contrast = (it.contrast + offset).coerceIn(-1f, 1f)) }

    companion object {
        /** The night's dim before it is moved: half the chart's light (the web's NIGHT_DIM). */
        const val NIGHT_DIM = 0.5f

        /** The deepest dim: the paper's white at 30%, about the least the chart's small print reads at. */
        const val DIM_MAX = 0.7f
        const val CONTRAST_MIN = -0.3f
        const val CONTRAST_MAX = 0.4f

        /** Each slider's stops, the web's LOOK_STEP of 0.05. */
        const val STEP = 0.05f
    }
}

/** The Dimmer and Contrast kept with the appearance, in one flow, so the
 *  map and the Map card see the same value at once. */
object ChartLookPreference {
    private val DIM_LIGHT = floatPreferencesKey("chart_dim_light")
    private val DIM_DARK = floatPreferencesKey("chart_dim_dark")
    private val CONTRAST = floatPreferencesKey("chart_contrast")
    private val state = MutableStateFlow<ChartLook?>(null)

    fun flow(context: Context): StateFlow<ChartLook?> {
        if (state.value == null) {
            val kept = Kept.of(context, "wingtip")
            state.value = ChartLook(kept[DIM_LIGHT] ?: 0f, kept[DIM_DARK] ?: ChartLook.NIGHT_DIM, kept[CONTRAST] ?: 0f)
        }
        return state.asStateFlow()
    }

    /** A slider's place as it is dragged: the map follows it, and the
     *  file is written once, as the drag ends (keep). */
    fun drag(look: ChartLook) {
        state.value = look
    }

    /** The place the drag ended at, written to the file. */
    fun keep(context: Context) {
        state.value?.let { set(context, it) }
    }

    fun set(context: Context, look: ChartLook) {
        Kept.of(context, "wingtip").edit {
            it[DIM_LIGHT] = look.dimLight
            it[DIM_DARK] = look.dimDark
            it[CONTRAST] = look.contrast
        }
        state.value = look
    }
}

@Composable
fun rememberChartLook(): State<ChartLook?> = ChartLookPreference.flow(LocalContext.current).collectAsStateWithLifecycle()

/**
 * The app's own light or dark told to the system (UiModeManager's
 * setApplicationNightMode, Android 12 and later), so the launch -- the
 * splash and the window's DayNight theme before Compose draws -- is in
 * the app's Dark or Light, not the phone's (the themes audit, 2026-11-27:
 * a pilot who set Dark launched into a white window). Set as Appearance is
 * picked and once at the start; the system keeps it across launches.
 * Before Android 12 there is no such call: the activity's own
 * configuration takes the pick as it is made (`override`, from
 * MainActivity.attachBaseContext), so its window's DayNight theme is the
 * app's from the first frame after the splash (the round-4 phones audit).
 */
object NightMode {
    /** The activity's uiMode with the app's Light or Dark in its night
     *  bits, before Android 12 and where one is picked; null otherwise
     *  (the system's own, or the phone's followed). Only uiMode is set,
     *  so the rest of the configuration still follows the device. */
    fun override(context: Context): Configuration? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return null
        val night = when (AppearancePreference.flow(context).value) {
            Appearance.LIGHT -> Configuration.UI_MODE_NIGHT_NO
            Appearance.DARK -> Configuration.UI_MODE_NIGHT_YES
            else -> return null
        }
        val type = context.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK
        return Configuration().apply { uiMode = type or night }
    }

    /** Whether the phone itself is dark: the application's configuration,
     *  which `override` leaves the phone's, where the activity's may carry
     *  the app's pick. */
    fun systemDark(context: Context): Boolean =
        (context.applicationContext.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    fun apply(context: Context, appearance: Appearance) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val mode = when (appearance) {
            Appearance.LIGHT -> UiModeManager.MODE_NIGHT_NO
            Appearance.DARK -> UiModeManager.MODE_NIGHT_YES
            Appearance.SYSTEM -> UiModeManager.MODE_NIGHT_AUTO
        }
        context.getSystemService(UiModeManager::class.java)?.setApplicationNightMode(mode)
    }
}

/** The Dimmer and Contrast rows under the Map card's Look, a stock slider
 *  each between its two glyphs, the Dimmer the one for the appearance on
 *  screen. */
@Composable
fun ChartLookRows() {
    val context = LocalContext.current
    val look = rememberChartLook().value ?: ChartLook()
    val dark = LocalShade.current.dark
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        LookSlider(
            stringResource(R.string.chart_dimmer), look.dim(dark), 0f..ChartLook.DIM_MAX, "chart-dimmer",
            start = { Icon(Icons.Filled.BrightnessHigh, contentDescription = stringResource(R.string.chart_dimmer_bright)) },
            end = { Icon(Icons.Filled.BrightnessLow, contentDescription = stringResource(R.string.chart_dimmer_dim)) },
            onChange = { v -> ChartLookPreference.drag(if (dark) look.copy(dimDark = v) else look.copy(dimLight = v)) },
            onDone = { ChartLookPreference.keep(context) },
        )
        LookSlider(
            stringResource(R.string.chart_contrast), look.offset, ChartLook.CONTRAST_MIN..ChartLook.CONTRAST_MAX, "chart-contrast",
            start = { Icon(Icons.Outlined.Circle, contentDescription = stringResource(R.string.chart_contrast_flatter)) },
            end = { Icon(Icons.Filled.Contrast, contentDescription = stringResource(R.string.chart_contrast_harder)) },
            onChange = { v -> ChartLookPreference.drag(look.copy(contrast = v)) },
            onDone = { ChartLookPreference.keep(context) },
        )
    }
}

@Composable
private fun LookSlider(
    name: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    tag: String,
    start: @Composable () -> Unit,
    end: @Composable () -> Unit,
    onChange: (Float) -> Unit,
    onDone: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        start()
        // Material's state-holding slider, as the plate's transparency:
        // dragged, the map follows; let go, the place is kept.
        val stops = ((range.endInclusive - range.start) / ChartLook.STEP).roundToInt() - 1
        val state = remember(range) { SliderState(value = value, steps = stops, trackRange = range) }
        if (!state.isDragging) state.value = value
        Slider(
            state = state,
            onValueChange = { v ->
                state.value = v
                onChange(v)
            },
            onValueChangeFinished = onDone,
            modifier = Modifier.weight(1f).testTag(tag).semantics { contentDescription = name },
        )
        end()
    }
}
