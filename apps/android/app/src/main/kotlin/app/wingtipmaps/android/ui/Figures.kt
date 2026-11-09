package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.stripFuel
import app.wingtipmaps.android.flight.InFlight
import java.util.Locale
import kotlin.math.roundToInt

// The figures' formatting, as the iOS app's AirportWords and FPLView
// write them: the words and the decimals are the app's, the figures
// themselves the planner's.

/** A distance to a tenth, "12.3 nm". */
fun nm(x: Double): String = String.format(Locale.US, "%.1f nm", x)

/** Fuel to a tenth, "8.4 gal". */
fun gal(x: Double): String = String.format(Locale.US, "%.1f gal", x)

/** A speed in whole knots, "112 kt". */
fun kt(x: Double): String = String.format(Locale.US, "%.0f kt", x)

/** Feet, whole, with a thousands separator: "3,500 ft". */
fun ft(x: Double): String = String.format(Locale.US, "%,.0f ft", x)

/** A heading or course in three figures, "007°". */
fun degrees(x: Double): String = String.format(Locale.US, "%03d°", ((x.roundToInt() % 360) + 360) % 360)

/** Minutes as the nav log's "1h 05m". */
fun hoursMinutes(minutes: Double): String {
    val whole = minutes.roundToInt()
    return String.format(Locale.US, "%dh %02dm", whole / 60, whole % 60)
}

/**
 * The flight's figures in one line -- To, Dist, ETE, Fuel -- what the
 * web app's pill shows at the sheet's foot (FlightLine) and the iOS app's
 * FiguresStrip, and what the pilot glances at in the air. The fuel is the
 * engine's `strip_fuel`, the web's and the iPhone's: the fuel required, in
 * the error colour where the tanks do not hold it and its reserve (14 CFR
 * 91.151, 91.167): a warning, never a limit.
 */
@Composable
fun FiguresStrip(state: Plan.State) {
    // In the air on the route -- moving, within 3 nm of the line (the
    // engine's `in_flight`, InFlight) -- the figures count down from where
    // the airplane is, as the iPhone's do: what is left to the destination
    // at the groundspeed now, and the fuel still required.
    val flight by InFlight.shared.state.collectAsStateWithLifecycle()
    val progress = flight.progress?.takeIf { it.onRoute }
    val warn = stripFuel(state.totals).getOrNull()?.short?.isNotEmpty() == true
    // A failed rule reads "Failed" in the error colour, never as no fuel
    // required (Engine.rule logs the engine's words).
    val fuel = stripFuel(state.totals, burntGal = progress?.burntGal)
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Figure("TO", if (state.routed) state.dest else "—")
        if (progress != null) {
            Figure("DIST", nm(progress.destination?.distanceNm ?: progress.leftNm))
            Figure("ETE", progress.destination?.eteMin?.let(::hoursMinutes) ?: "—")
        } else {
            val distance = state.totals?.distanceNm ?: state.course?.distanceNm
            Figure("DIST", distance?.let(::nm) ?: "—")
            Figure("ETE", state.totals?.eteMin?.let(::hoursMinutes) ?: "—")
        }
        fuel.fold(
            { Figure("FUEL", it.requiredGal?.let(::gal) ?: "—", warn = warn) },
            { Figure("FUEL", "Failed", warn = true) },
        )
    }
}

/** The strip's fuel from the planner's totals, as the engine works it for
 *  the three apps (`strip_fuel`); a failure where the engine could not. */
fun stripFuel(totals: NavLogTotals?, burntGal: Double? = null): Result<EngineContract.StripFuelAnswer> =
    Engine.stripFuel(fuelRequiredGal = totals?.fuelRequiredGal, fuelMarginGal = totals?.fuelMarginGal, burntGal = burntGal)

/** One figure of the strip, its name over it. */
@Composable
fun RowScope.Figure(name: String, value: String, warn: Boolean = false) {
    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.titleMedium,
            color = if (warn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * A problem said where it happened, as the web app's lib/problems says
 * it: the call's own words in the error colour under what failed, and
 * nothing at all without one.
 */
@Composable
fun ProblemLine(problem: String?) {
    if (problem != null) {
        Text(problem, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}
