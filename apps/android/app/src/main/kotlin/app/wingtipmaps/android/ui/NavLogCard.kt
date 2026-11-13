package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.alternate.AlternateLegRow
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.route.LegPhase
import app.wingtipmaps.android.route.LegWords
import app.wingtipmaps.android.route.RoutePointMenu
import app.wingtipmaps.android.strip.StripData
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The Nav Log, a card of its own on the sheet's stack (the card rule's 3,
 * the owner, 2026-11-11), not a part of the plan's page: the route's name
 * under its own, then the legs as the planner streams them, each opening
 * its leg's card (RouteLegCard, the map's own) over this one so Back comes
 * back here, and its end's menu (RoutePointMenu); the alternate's leg
 * under IFR; the totals and the fuel check; the route in plain words.
 * Every figure is the planner's, written by Format; a leg's cruise
 * altitude is FL-045 as the cruise controls write it (decision 0009).
 *
 * @param onLeg a leg's card, by its number from the departure.
 * @param onAddStopAfter the search opened for a stop after a point.
 */
@Composable
fun NavLogCard(plan: Plan, exit: CardExit, onLeg: (Int) -> Unit, onAddStopAfter: (String) -> Unit) {
    val state by plan.state.collectAsStateWithLifecycle()
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)
    val route = if (state.dep.isEmpty() && state.dest.isEmpty()) null else StripData.routeName(state.dep, state.dest, state.stops)
    CardPage(title = stringResource(R.string.nav_log), exit = exit, subtitle = route) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            itemsIndexed(state.legs, key = { i, _ -> "leg-$i" }) { i, leg ->
                Column(pad) {
                    LegRow(leg, onOpen = { onLeg(i) }) { RoutePointMenu(leg.to, plan, onAddStopAfter) }
                    HorizontalDivider()
                }
            }
            state.totals?.let { totals ->
                // Under IFR with an alternate filed, the leg on to it.
                totals.alternate?.let { alt -> item(key = "alternate-leg") { Column(pad) { AlternateLegRow(alt); HorizontalDivider() } } }
                item(key = "totals") { Column(pad) { TotalsRows(totals, rememberAirplaneNow(plan)) } }
                // The route and its nav log in plain words, under the totals.
                item(key = "ai-route") {
                    Box(pad) { AiWordsRow(AiTask.ROUTE, key = state.legs.hashCode().toString(), sources = { AiSources.route(state.legs, state.totals, state.aircraft) }) }
                }
            }
            item(key = "foot") { Spacer(Modifier.height(WingtipSpace.Xl)) }
        }
    }
}

/** One leg's row: to where at what cruise altitude, how far, the
 *  magnetic heading, the time; a tap opens the leg, and its end's menu
 *  (RoutePointMenu) sits at the row's end. TalkBack reads the row as one
 *  sentence in words (LegWords), so a swipe is a leg. */
@Composable
private fun LegRow(leg: Leg, onOpen: () -> Unit, menu: @Composable () -> Unit) {
    val openLeg = stringResource(R.string.said_open_leg)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        // Material's clickable surface, clear, over the leg's figures.
        Surface(onClick = onOpen, color = Color.Transparent, modifier = Modifier.weight(1f).semantics { onClick(label = openLeg, action = null) }) {
            LegFigures(leg, Modifier.fillMaxWidth())
        }
        menu()
    }
}

/** The leg's figures, read as one sentence. */
@Composable
private fun LegFigures(leg: Leg, modifier: Modifier) {
    Row(
        modifier.clearAndSetSemantics { contentDescription = LegWords.row(leg) }.padding(vertical = WingtipSpace.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1.4f)) {
            Text(leg.to, style = MaterialTheme.typography.titleMedium)
            // The leg's phase where it is flown whole in the climb or the
            // descent, its figures that phase's (LegPhase).
            val altitude = Format.cruiseAltitude(leg.altitudeFt)
            val phase = LegPhase.name(leg)
            Text(
                if (phase != null) stringResource(R.string.leg_in_phase, altitude, phase) else altitude,
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LegFigure(stringResource(R.string.figure_dist), Format.distance(leg.distanceNm))
        // The heading needs the airplane's airspeed against the wind: with
        // none chosen, the leg's magnetic course instead (decision 0011).
        val heading = leg.magneticHeadingDeg
        if (heading != null) LegFigure(stringResource(R.string.figure_mh), Format.heading(heading))
        else LegFigure(stringResource(R.string.figure_mc), Format.heading(leg.magneticCourseDeg))
        leg.eteMin?.let { LegFigure(stringResource(R.string.figure_ete), Format.navLogTime(it)) }
    }
}

/** One of a leg's figures, its name over it (the alternate's leg too,
 *  AlternateLegRow): the nav log is a table read down its columns, so the figures are bodyLarge with tabular digits
 *  ("tnum") and line up leg under leg, never smaller to fit. */
@Composable
internal fun RowScope.LegFigure(name: String, value: String) {
    Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
        Text(name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum"), maxLines = 1)
    }
}

/** The flight's totals, and the fuel the planner holds it to. */
@Composable
private fun TotalsRows(totals: NavLogTotals, airplane: AirplaneNow) {
    val warn = (totals.fuelMarginGal ?: 0.0) < 0
    Row(Modifier.fillMaxWidth()) {
        Figure(stringResource(R.string.figure_dist), Format.distance(totals.distanceNm), said = stringResource(R.string.leg_distance) + ", " + Spoken.distance(totals.distanceNm))
        // Time and fuel only with an airplane: the planner sends none
        // without one, and none is guessed (decision 0011).
        totals.eteMin?.let { Figure(stringResource(R.string.figure_ete), Format.duration(it), said = stringResource(R.string.leg_time) + ", " + Spoken.duration(it)) }
        totals.fuelGal?.let { Figure(stringResource(R.string.figure_fuel), Format.fuel(it), warn = warn, said = stringResource(R.string.leg_fuel) + ", " + Spoken.fuel(it)) }
        totals.fuelRequiredGal?.let { Figure(stringResource(R.string.figure_required), Format.fuel(it), warn = warn, said = stringResource(R.string.said_fuel_required) + ", " + Spoken.fuel(it)) }
    }
    if (warn) ProblemLine(stringResource(R.string.under_reserve), Modifier.padding(top = WingtipSpace.Xs))
    // When it was planned and whose winds it flies, for use when.
    PlannedLine(totals, Modifier.padding(top = WingtipSpace.Xs))
    // An airplane whose profile has no start, taxi and takeoff allowance:
    // the planner leaves it out of the fuel required rather than take a
    // stock airplane's (the owner, 2026-11-09), and the pilot is asked for
    // it here, the totals worked out again once it is given.
    if (totals.fuelRequiredGal != null) AskFigures(airplane, "fuel_totals", Modifier.padding(top = WingtipSpace.Xs))
}
