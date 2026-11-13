package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.ui.WingtipIcons
import app.wingtipmaps.android.ui.largeType
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * A leg of the route, one card from the map's line, the nav log's row
 * and the strip's checkpoint alike (the card rule, 2026-11-10: one view
 * of a leg), as ForeFlight opens one from a tap on its course (the
 * owner's screenshot, 2026-11-08) and the web's RouteLegCard: the leg's
 * ends, Active Leg on the one being flown, its actions in a row -- Direct
 * to its end (from the airplane where own ship is on, else the
 * departure; Plan.directToStop), or Cancel Direct; Remove a stop in the
 * error colour -- then the nav log's figures for it: the cruise altitude,
 * the courses, the heading, the variation, the distance, the time, the
 * groundspeed, the airspeed and the fuel, each the planner's. A figure
 * the planner sent none of (no airplane chosen: no heading, airspeed,
 * time or fuel) is left out rather than guessed (decision 0011). An
 * action closes the card, so the route is seen being planned again.
 */
@Composable
fun RouteLegCard(index: Int, plan: Plan, ownShipOn: Boolean, exit: CardExit, flight: FlightModel = hiltViewModel()) {
    val state by plan.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val inFlight by flight.state.collectAsStateWithLifecycle()
    // The point flying mode flies to: the engine's next waypoint on the route.
    val flyingTo = inFlight.progress?.takeIf { ownShipOn && it.onRoute }?.next?.name
    val leg = RouteLegModel.view(index, state, flyingTo)
    val haptics = rememberHaptics()
    if (leg == null) {
        // The route was planned again without this leg: the card goes.
        LaunchedEffect(index) { exit.back() }
        return
    }
    CardPage(title = stringResource(R.string.route_leg), exit = exit) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md),
        ) {
            Ends(leg)
            Actions(
                leg,
                onDirect = {
                    if (leg.directOn) {
                        plan.cancelDirect()
                    } else {
                        plan.directToStop(leg.to, if (ownShipOn) fix else null)
                        haptics.tap(WingtipHaptic.DIRECT_TO)
                    }
                    exit.close()
                },
                onRemove = {
                    plan.removeStop(leg.to)
                    exit.close()
                },
            )
            val figures = leg.leg
            if (figures != null) {
                NavLogFigures(figures)
                // Its tops of climb and descent, each piece's own figures.
                LegTops(figures, plan)
            } else {
                Fact(stringResource(R.string.route_leg_distance), leg.distanceNm?.let(Format::distance) ?: Format.NONE, Spoken.distance(leg.distanceNm))
                Fact(
                    stringResource(R.string.route_leg_course), leg.courseMagDeg?.let { Format.heading(it) + "M" } ?: Format.NONE,
                    leg.courseMagDeg?.let(Spoken::headingMagnetic) ?: Spoken.NOT_KNOWN,
                )
            }
        }
    }
}

/** "KJVL → KMSN", with Active Leg on the one being flown. */
@Composable
private fun Ends(leg: RouteLegModel.View) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Text(leg.from, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = stringResource(R.string.route_leg_to), modifier = Modifier.size(WingtipSpace.Lg + WingtipSpace.Xs))
        Text(leg.to, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (leg.active) SuggestionChip(onClick = {}, enabled = false, label = { Text(stringResource(R.string.route_leg_active)) })
    }
}

/** Direct to its end (or Cancel Direct), and Remove where its end is a stop. */
@Composable
private fun Actions(leg: RouteLegModel.View, onDirect: () -> Unit, onRemove: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        FilledTonalButton(onClick = onDirect, modifier = Modifier.weight(1f)) {
            Icon(WingtipIcons.directTo, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
            Text(
                if (leg.directOn) stringResource(R.string.route_leg_cancel_direct) else stringResource(R.string.route_leg_direct, leg.to),
                modifier = Modifier.padding(start = ButtonDefaults.IconSpacing), maxLines = if (largeType()) 2 else 1,
            )
        }
        if (leg.removable) {
            OutlinedButton(
                onClick = onRemove, modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                Text(stringResource(R.string.route_leg_remove, leg.to), modifier = Modifier.padding(start = ButtonDefaults.IconSpacing), maxLines = if (largeType()) 2 else 1)
            }
        }
    }
}

/** The nav log's figures for the leg, each the planner's, written by
 *  Format; a leg's cruise altitude is FL-045 as the cruise controls write
 *  it (decision 0009). */
@Composable
private fun NavLogFigures(leg: Leg) {
    Column {
        Fact(stringResource(R.string.leg_altitude), Format.cruiseAltitude(leg.altitudeFt), Spoken.altitude(leg.altitudeFt))
        Fact(stringResource(R.string.leg_true_course), Format.heading(leg.trueCourseDeg), Spoken.headingTrue(leg.trueCourseDeg))
        Fact(stringResource(R.string.leg_magnetic_course), Format.heading(leg.magneticCourseDeg), Spoken.headingMagnetic(leg.magneticCourseDeg))
        leg.magneticHeadingDeg?.let { Fact(stringResource(R.string.leg_magnetic_heading), Format.heading(it), Spoken.headingMagnetic(it)) }
        Fact(stringResource(R.string.leg_variation), Format.variation(leg.magneticVariationDeg))
        Fact(stringResource(R.string.leg_distance), Format.distance(leg.distanceNm), Spoken.distance(leg.distanceNm))
        leg.eteMin?.let { Fact(stringResource(R.string.leg_time), Format.navLogTime(it), Spoken.duration(it)) }
        leg.groundspeedKt?.let { Fact(stringResource(R.string.leg_groundspeed), Format.speed(it), Spoken.speed(it)) }
        leg.tasKt?.let { Fact(stringResource(R.string.leg_airspeed), Format.speed(it), Spoken.speed(it)) }
        leg.fuelGal?.let { Fact(stringResource(R.string.leg_fuel), Format.fuel(it), Spoken.fuel(it)) }
    }
}

/** A figure's row, read as one: its name, then the figure in words
 *  (`said`) or as written where there is no spoken form. Tabular digits
 *  ("tnum"), as the nav log's columns are, so figures line up. */
@Composable
private fun Fact(name: String, value: String, said: String = value) {
    ListItem(
        trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum")) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clearAndSetSemantics { contentDescription = "$name, $said" },
        content = { Text(name) },
    )
}
