package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.stripFuel
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.format.Format

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
    Row(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs)) {
        Figure(stringResource(R.string.figure_to), if (state.routed) state.dest else Format.NONE)
        if (progress != null) {
            Figure(stringResource(R.string.figure_dist), Format.distance(progress.destination?.distanceNm ?: progress.leftNm))
            Figure(stringResource(R.string.figure_ete), progress.destination?.eteMin?.let(Format::duration) ?: Format.NONE)
        } else {
            Figure(stringResource(R.string.figure_dist), Format.distance(state.totals?.distanceNm ?: state.course?.distanceNm))
            Figure(stringResource(R.string.figure_ete), state.totals?.eteMin?.let(Format::duration) ?: Format.NONE)
        }
        fuel.fold(
            { Figure(stringResource(R.string.figure_fuel), Format.fuel(it.requiredGal), warn = warn) },
            { Figure(stringResource(R.string.figure_fuel), stringResource(R.string.failed), warn = true) },
        )
    }
}

/** The strip's fuel from the planner's totals, as the engine works it for
 *  the three apps (`strip_fuel`); a failure where the engine could not. */
fun stripFuel(totals: NavLogTotals?, burntGal: Double? = null): Result<EngineContract.StripFuelAnswer> =
    Engine.stripFuel(fuelRequiredGal = totals?.fuelRequiredGal, fuelMarginGal = totals?.fuelMarginGal, burntGal = burntGal)

/** One figure of a strip, its name over it. */
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
 * A problem said where it happened, the app's one error style, as the
 * web app's lib/problems says it: the error glyph and the call's own
 * words in the error colour under what failed, read out as it appears,
 * and nothing at all without one.
 */
@Composable
fun ProblemLine(problem: String?, modifier: Modifier = Modifier) {
    if (problem.isNullOrEmpty()) return
    Row(
        modifier.semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(WingtipSpace.Lg + WingtipSpace.Xs))
        Text(problem, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
    }
}
