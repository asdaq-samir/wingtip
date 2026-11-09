package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.design.RollingFigure
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.stripFuel
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen

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
    val to = stringResource(R.string.figure_to)
    val dist = stringResource(R.string.figure_dist)
    val ete = stringResource(R.string.figure_ete)
    val fuelName = stringResource(R.string.figure_fuel)
    val saidTo = stringResource(R.string.said_to)
    val saidDist = stringResource(R.string.leg_distance)
    val saidEte = stringResource(R.string.leg_time)
    val saidFuel = stringResource(R.string.said_fuel_required)
    val failed = stringResource(R.string.failed)
    // Each figure with what TalkBack says for it (Spoken), so "102.4 nm"
    // is heard as miles rather than as "one hundred two point four n m".
    val figures = buildList {
        add(StripFigure(to, if (state.routed) state.dest else Format.NONE, "$saidTo, ${if (state.routed) state.dest else Spoken.NOT_KNOWN}"))
        val nm = if (progress != null) progress.destination?.distanceNm ?: progress.leftNm
        else state.totals?.distanceNm ?: state.course?.distanceNm
        add(StripFigure(dist, Format.distance(nm), "$saidDist, ${Spoken.distance(nm)}"))
        // With no airplane, To and Dist alone: no time or fuel is guessed
        // (decision 0011).
        if (state.airplane) {
            val min = if (progress != null) progress.destination?.eteMin else state.totals?.eteMin
            add(StripFigure(ete, min?.let(Format::duration) ?: Format.NONE, "$saidEte, ${Spoken.duration(min)}"))
            fuel.fold(
                { add(StripFigure(fuelName, Format.fuel(it.requiredGal), "$saidFuel, ${Spoken.fuel(it.requiredGal)}", warn)) },
                { add(StripFigure(fuelName, failed, "$saidFuel, $failed", warn = true)) },
            )
        }
    }
    // At 150 % type and more four figures do not fit across a phone: two
    // rows of two, so no figure is cut.
    val rows = if (largeType()) figures.chunked(2) else listOf(figures)
    // The figures open the nav log they add up, the FPL tab's legs (tap
    // what you see, docs/navigation.md).
    val openNavLog = stringResource(R.string.said_open_nav_log)
    Column(
        Modifier.fillMaxWidth().clickable(enabled = state.routed, role = Role.Button, onClickLabel = openNavLog) { ScreenRequests.ask(Screen.NAVLOG) }
            .padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Xs),
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
    ) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth()) { row.forEach { Figure(it.name, it.value, it.warn, it.said) } }
        }
    }
}

/** One of the strip's figures: its name, as written and as said. */
private data class StripFigure(val name: String, val value: String, val said: String, val warn: Boolean = false)

/** The strip's fuel from the planner's totals, as the engine works it for
 *  the three apps (`strip_fuel`); a failure where the engine could not. */
fun stripFuel(totals: NavLogTotals?, burntGal: Double? = null): Result<EngineContract.StripFuelAnswer> =
    Engine.stripFuel(fuelRequiredGal = totals?.fuelRequiredGal, fuelMarginGal = totals?.fuelMarginGal, burntGal = burntGal)

/** One figure of a strip, its name over it, read as one node: `said` is
 *  what TalkBack says, the name and the figure in words (Spoken); the
 *  written name and figure where none is given. At large type the figure
 *  takes a second line rather than being cut; otherwise a change rolls
 *  its digits. */
@Composable
fun RowScope.Figure(name: String, value: String, warn: Boolean = false, said: String? = null) {
    Column(
        Modifier.weight(1f).clearAndSetSemantics { contentDescription = said ?: "$name, $value" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // The figure rolls its digits as it counts down in flight
        // (RollingFigure), in the expressive figure role.
        RollingFigure(
            value,
            style = MaterialTheme.typography.titleMediumEmphasized,
            color = if (warn) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            maxLines = if (largeType()) 2 else 1,
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
