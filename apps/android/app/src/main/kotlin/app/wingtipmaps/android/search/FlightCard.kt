package app.wingtipmaps.android.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.strip.StripCard
import app.wingtipmaps.android.strip.StripData

/**
 * The flight as a card at the head of what the search shows with nothing
 * typed (the owner's canvas, 2026-11-09): the route, then how far, how
 * long, the fuel, the altitude and the airplane -- every figure the
 * planner's as it sent it, written by Format, and time and fuel only with
 * an airplane (decision 0011). A tap opens the plan. With no route yet it
 * says so, and the tap opens the plan to start one.
 */
@Composable
fun FlightCard(state: Plan.State, tail: String?, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val title = if (state.dep.isEmpty() && state.dest.isEmpty()) stringResource(R.string.no_flight) else StripData.routeName(state.dep, state.dest, state.stops)
    val line = if (state.routed) figures(state, tail) else stringResource(R.string.no_flight_line)
    val label = stringResource(R.string.your_flight)
    // Material's card with a click reads its words as one, a button.
    StripCard(modifier = modifier.fillMaxWidth(), onClick = onOpen) {
        Column(Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(line, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** "72.0 nm · 41m · 5.8 gal · 4,500 ft · N3429J": the planner's figures. */
private fun figures(state: Plan.State, tail: String?): String {
    val totals = state.totals
    val altitude = state.altitudeFt ?: state.legs.firstOrNull()?.altitudeFt
    return listOfNotNull(
        Format.distance(totals?.distanceNm ?: state.course?.distanceNm),
        totals?.eteMin?.let(Format::duration),
        totals?.fuelGal?.let(Format::fuel),
        altitude?.let(Format::altitude),
        tail ?: state.aircraft.uppercase().ifEmpty { null },
    ).joinToString(" · ")
}
