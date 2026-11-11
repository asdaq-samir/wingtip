package app.wingtipmaps.android.altitude

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import kotlin.math.roundToInt

/**
 * A waypoint tapped on the profile: the leg's altitude from it, in the
 * app's one modal sheet (Material's ModalBottomSheet, WingtipSheet), as
 * ForeFlight's profile sets one -- **Start At**, the climb or descent
 * begins at the waypoint, or **Cross At**, it is done by the waypoint --
 * on a stock Slider through the route's altitudes. The climb and descent
 * themselves are the planner's and the engine's, from the airplane's
 * figures; with no airplane there are no times or fuel, only the line.
 * Any altitude may be set: one the rules would not pick is planned and
 * warned of, never refused (the owner's warn, never limit).
 */
@Composable
fun LegAltitudeSheet(
    waypoint: ProfileModel.Waypoint,
    steps: List<Double>,
    set: PlanAltitudes.Point?,
    onSet: (PlanAltitudes.Point) -> Unit,
    onClear: () -> Unit,
    onClose: () -> Unit,
) {
    if (steps.isEmpty()) return
    val haptics = rememberHaptics()
    var how by remember { mutableStateOf(set?.how ?: PlanAltitudes.How.START_AT) }
    val state = remember(steps) {
        SliderState(value = nearest(steps, set?.ft ?: waypoint.legFt).toFloat(), steps = (steps.size - 2).coerceAtLeast(0), trackRange = 0f..(steps.size - 1).coerceAtLeast(1).toFloat())
    }
    val ft = steps[state.value.roundToInt().coerceIn(steps.indices)]
    val label = stringResource(R.string.altitude_slider)
    WingtipSheet(title = stringResource(R.string.altitude_at, waypoint.ident), onClose = onClose) {
        Column(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            ChoiceGroup(
                listOf(PlanAltitudes.How.START_AT to stringResource(R.string.altitude_start_at), PlanAltitudes.How.CROSS_AT to stringResource(R.string.altitude_cross_at)),
                selected = how,
            ) { how = it }
            Text(Format.cruiseAltitude(ft), style = MaterialTheme.typography.headlineSmall)
            // Where the engine flies the change (altitude_change), or why not.
            val change = remember(ft, how) { AltitudeEngine.change(waypoint, ft, how) }
            change.fold(
                { c -> if (c.kind != "level") Text(changeWords(c), style = MaterialTheme.typography.bodyMedium) },
                { why -> ProblemLine(why.message) },
            )
            Slider(
                state = state,
                onValueChange = { v ->
                    if (v.roundToInt() != state.value.roundToInt()) haptics.tap(WingtipHaptic.ALTITUDE)
                    state.value = v
                },
                modifier = Modifier.fillMaxWidth().testTag("leg-altitude-slider").semantics {
                    contentDescription = label
                    stateDescription = Spoken.altitude(ft)
                },
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm, androidx.compose.ui.Alignment.End)) {
                if (set != null) TextButton(onClick = onClear) { Text(stringResource(R.string.altitude_plans_own)) }
                Button(onClick = { onSet(PlanAltitudes.Point(waypoint.ident, ft, how)) }, modifier = Modifier.testTag("leg-altitude-set")) {
                    Text(stringResource(R.string.altitude_set))
                }
            }
        }
    }
}

/** A change as written: "Descent from 12.0 nm to 18.7 nm · 4m · 0.8 gal". */
internal fun changeWords(c: AltitudeEngine.Change): String = listOfNotNull(
    "${c.kind.replaceFirstChar { it.uppercase() }} from ${Format.distance(c.beginsNm)} to ${Format.distance(c.endsNm)}",
    c.minutes?.let(Format::duration),
    c.gallons?.let(Format::fuel),
).joinToString(" · ")
