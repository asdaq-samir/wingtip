package app.wingtipmaps.android.altitude

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SliderState
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalSlider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.format.Format
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The profile's altitude slider, Material's stock VerticalSlider (M3
 * 1.5): it steps through the route's legal altitudes, lowest at the foot,
 * and previews each on the profile -- the ground and obstacles near it
 * coloured, its clearance in words over it -- while the plan stays as it
 * was until **Set**. In flight, **Auto** takes the preview back to the
 * airplane's own altitude. TalkBack reads the altitude and its clearance
 * as the slider's state (the engine's words, "3,500 ft, terrain within
 * 500 ft near KXYZ"), and its volume keys step it as any slider's.
 *
 * @param steps the altitudes, lowest first (ProfileModel.steps).
 * @param flownFt what the plan flies now, where the slider starts.
 * @param airplaneFt the airplane's altitude in flight; null on the ground,
 *   when Auto is not shown.
 */
@Composable
fun AltitudeSlider(
    steps: List<Double>,
    flownFt: Double?,
    previewFt: Double?,
    clearance: AltitudeEngine.Clearance?,
    airplaneFt: Double?,
    onPreview: (Double?) -> Unit,
    onSet: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (steps.isEmpty()) return
    val haptics = rememberHaptics()
    val start = nearest(steps, previewFt ?: flownFt)
    val state = remember(steps) { SliderState(value = start.toFloat(), steps = (steps.size - 2).coerceAtLeast(0), trackRange = 0f..(steps.size - 1).coerceAtLeast(1).toFloat()) }
    // The plan planned again (or Auto): the thumb to what is previewed.
    LaunchedEffect(steps, previewFt, flownFt) { state.value = nearest(steps, previewFt ?: flownFt).toFloat() }
    val shown = steps[state.value.roundToInt().coerceIn(steps.indices)]
    val label = stringResource(R.string.altitude_slider)
    Column(modifier.width(WingtipSize.TapTarget * 2), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Text(Format.cruiseAltitude(shown), style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
        VerticalSlider(
            state = state,
            onValueChange = { v ->
                val before = state.value.roundToInt()
                state.value = v
                val at = v.roundToInt().coerceIn(steps.indices)
                if (at != before) haptics.tap(WingtipHaptic.ALTITUDE)
                onPreview(steps[at].takeIf { it != flownFt })
            },
            topToBottom = false,
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .testTag("altitude-slider")
                .semantics {
                    contentDescription = label
                    stateDescription = clearance?.words ?: Format.cruiseAltitude(shown)
                },
        )
        Button(onClick = { onSet(shown) }, enabled = shown != flownFt, modifier = Modifier.testTag("altitude-set")) { Text(stringResource(R.string.altitude_set)) }
        if (airplaneFt != null) {
            OutlinedButton(onClick = { onPreview(steps[nearest(steps, airplaneFt)].takeIf { it != flownFt }) }, modifier = Modifier.testTag("altitude-auto")) {
                Text(stringResource(R.string.altitude_auto))
            }
        }
    }
}

/** The step nearest an altitude (the lowest where there is none). */
internal fun nearest(steps: List<Double>, ft: Double?): Int =
    if (ft == null) 0 else steps.indices.minByOrNull { abs(steps[it] - ft) } ?: 0
