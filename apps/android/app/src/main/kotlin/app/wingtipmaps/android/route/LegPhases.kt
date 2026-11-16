package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import java.util.Locale
import kotlin.math.roundToLong

/**
 * A leg's phase of flight, as the nav log says it (the owner, 2026-11-13:
 * "the calculations should reflect that phase of flight"): a leg flown
 * whole in the climb or the descent states that phase's figures, which
 * the engine already worked (its `phase`, wind triangle at the climb's or
 * the descent's speed, FAA-H-8083-25C ch. 16); a cruise leg names none.
 */
object LegPhase {
    @Composable
    fun name(leg: Leg): String? = when (leg.phase) {
        "climb" -> stringResource(R.string.phase_climb)
        "descent" -> stringResource(R.string.phase_descent)
        else -> null
    }
}

/**
 * The leg's top of climb and top of descent where it is cut by one, each
 * with the figures of the piece it begins or ends -- the climb's ground
 * speed, true airspeed, heading and fuel flow up to the top, the
 * descent's after it, and the descent's rate -- all the engine's
 * (with_descents, descent_phase). Where the airplane gave no descent
 * figures, the descent is flown on the cruise's and the top says so,
 * asking for them inline (AskFigures, the engine's airplane_needs
 * "descent"); nothing is assumed (the owner, 2026-11-09).
 */
@Composable
fun LegTops(leg: Leg, plan: Plan) {
    val from = leg.from
    leg.toc?.let { toc ->
        Top(stringResource(R.string.top_of_climb), stringResource(R.string.top_along, Format.distance(toc.alongNm), from))
        Figure(stringResource(R.string.leg_altitude), Format.altitude(toc.altitudeFt), Spoken.altitude(toc.altitudeFt))
        Figure(stringResource(R.string.leg_groundspeed), Format.speed(toc.groundspeedKt), Spoken.speed(toc.groundspeedKt))
        Figure(stringResource(R.string.leg_airspeed), Format.speed(toc.tasKt), Spoken.speed(toc.tasKt))
        toc.magneticHeadingDeg?.let { Figure(stringResource(R.string.leg_magnetic_heading), Format.heading(it), Spoken.headingMagnetic(it)) }
        toc.fuelBurnGph?.let { Figure(stringResource(R.string.leg_fuel_flow), Format.burn(it)) }
    }
    // Where the airplane gave no climb fuel flow, the climb's fuel is not
    // counted: said as missing and asked for in place (the engine's
    // climb_fuel_unknown, the aviation audit's AV-8; nothing assumed, the
    // owner, 2026-11-09).
    if (leg.climbFuelUnknown == true) {
        Text(
            stringResource(R.string.climb_fuel_unknown), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs),
        )
        AskFigures(rememberAirplaneNow(plan), "climb", Modifier.padding(top = WingtipSpace.Xs))
    }
    leg.tod?.let { tod ->
        Top(stringResource(R.string.top_of_descent), stringResource(R.string.top_along, Format.distance(tod.alongNm), from))
        Figure(stringResource(R.string.leg_descent_rate), fpm(tod.fpm))
        tod.groundspeedKt?.let { Figure(stringResource(R.string.leg_groundspeed), Format.speed(it), Spoken.speed(it)) }
        tod.tasKt?.let { Figure(stringResource(R.string.leg_airspeed), Format.speed(it), Spoken.speed(it)) }
        tod.magneticHeadingDeg?.let { Figure(stringResource(R.string.leg_magnetic_heading), Format.heading(it), Spoken.headingMagnetic(it)) }
        tod.fuelBurnGph?.let { Figure(stringResource(R.string.leg_fuel_flow), Format.burn(it)) }
        if (tod.descentAtCruise == true) {
            Text(
                stringResource(R.string.descent_at_cruise), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = WingtipSpace.Lg),
            )
            AskFigures(rememberAirplaneNow(plan), "descent", Modifier.padding(top = WingtipSpace.Xs))
        }
    }
}

/** "600 fpm": the engine's rate, already to the nearest 50 fpm. */
private fun fpm(rate: Double): String = String.format(Locale.US, "%,d fpm", rate.roundToLong())

@Composable
private fun Top(title: String, where: String) {
    Column(Modifier.padding(top = WingtipSpace.Md).semantics(mergeDescendants = true) { heading() }) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(where, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** A figure's row, read as one, as the leg's own are (tabular digits). */
@Composable
private fun Figure(name: String, value: String, said: String = value) {
    ListItem(
        trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum")) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clearAndSetSemantics { contentDescription = "$name, $said" },
        content = { Text(name) },
    )
}
