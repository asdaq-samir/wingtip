package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.graphics.toColorInt
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.Tracking
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.here.HereCard
import app.wingtipmaps.android.live.DepartureLine
import app.wingtipmaps.android.live.SpecialUseRows
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The card of a thing on the map, as the web's map opens one in its
 * sheet (MapCard: AirspaceCardBody, VorCard, FixCard, WaypointCard, a
 * traffic airplane's; a field's is AirportCard, a leg's RouteLegCard):
 * one card over the search with its name and ← where the search was
 * (CardPage), the same from a tap on the map, an alert or a route
 * point's More Info (CardRequests): what it is, the figures a pilot reads
 * off it, each from the tapped feature's own fields or the engine
 * (MapRules), and the card kind's actions (CardActionRow), the same set
 * as the web's.
 */
@Composable
fun ThingCard(pick: MapPick, plan: Plan, exit: CardExit) {
    val title = when (pick) {
        is MapPick.Airspace -> stringResource(R.string.airspace_class, pick.airspaceClass)
        is MapPick.Vor -> pick.ident
        is MapPick.Point -> pick.ident
        is MapPick.Plane -> pick.hex.uppercase()
        is MapPick.Here -> stringResource(R.string.whats_here)
        // A field's and a leg's cards are their own (SheetPage.of).
        is MapPick.Airport -> pick.ident
        is MapPick.RouteLeg -> stringResource(R.string.route_leg)
        is MapPick.Plate -> pick.ident
    }
    val actions = rememberRouteActions(plan)
    // An action that changes the route closes the card, so the route is
    // seen being planned; Call, Address and Copy leave it open.
    val act: (CardAction, () -> Unit) -> Unit = { action, run ->
        run()
        if (action != CardAction.CALL && action != CardAction.ADDRESS && action != CardAction.COPY) exit.close()
    }
    CardPage(title = title, exit = exit) { padding ->
        // Traffic is heard again by itself; no pull to refresh in a sheet.
        Box(Modifier.padding(padding)) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Lg),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
            ) {
                when (pick) {
                    is MapPick.Airspace -> {
                        AirspaceCard(pick)
                        PointActions(CardKind.POINT, pick, actions, act)
                        SpecialUseRows(pick.lat, pick.lon)
                    }
                    is MapPick.Vor -> {
                        VorCard(pick)
                        PointActions(CardKind.NAVAID, pick, actions, act)
                    }
                    is MapPick.Point -> {
                        PointCard(pick)
                        PointActions(CardKind.NAVAID, pick, actions, act)
                    }
                    is MapPick.Plane -> PlaneCard(pick.hex)
                    is MapPick.Here -> {
                        PointActions(CardKind.POINT, pick, actions, act)
                        HereCard(pick.lat, pick.lon)
                        SpecialUseRows(pick.lat, pick.lon)
                    }
                    is MapPick.Airport, is MapPick.RouteLeg, is MapPick.Plate -> {}
                }
            }
        }
    }
}

@Composable
private fun PointActions(kind: CardKind, pick: MapPick, actions: RouteActions, act: (CardAction, () -> Unit) -> Unit) {
    val point = RouteActions.pointOf(pick) ?: return
    val copy = RouteActions.copyOf(pick)
    CardActionRow(kind, can = { actions.canPoint(it, copy != null) }, onAction = { a -> act(a) { actions.point(a, point, copy) } })
}

/** The card's head under its title: its mark's colour, what it is, and a
 *  line under that. */
@Composable
internal fun Head(colour: Color, kind: String, subtitle: String?) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        Box(Modifier.size(width = WingtipSpace.Sm, height = WingtipSize.Chip).background(colour, MaterialTheme.shapes.extraSmall))
        Column {
            Text(kind, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!subtitle.isNullOrEmpty()) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** A row of a card: a name and its value, Material's list item. */
@Composable
internal fun Fact(name: String, value: String, description: Boolean = false) {
    ListItem(
        supportingContent = if (description) ({ Text(value) }) else null,
        trailingContent = if (description) null else ({ Text(value, style = MaterialTheme.typography.bodyLarge) }),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(name) },
    )
}

internal fun ink(hex: String) = Color(hex.toColorInt())

/** An airplane heard (the web's traffic card): what it is, its height
 *  against own ship's as TCAS writes it (the engine's `traffic_marks`),
 *  its speed and track, and Track, which follows it (Tracking) and keeps
 *  it ringed on the map. */
@Composable
private fun PlaneCard(hex: String) {
    val context = LocalContext.current
    val traffic = remember(context) { Traffic.of(context) }
    val tracking = remember(context) { Tracking.of(context) }
    val planes by traffic.planes.collectAsStateWithLifecycle()
    val marks by traffic.marks.collectAsStateWithLifecycle()
    val trafficProblem by traffic.problem.collectAsStateWithLifecycle()
    val watchProblem by tracking.problem.collectAsStateWithLifecycle()
    val tracked by tracking.hex.collectAsStateWithLifecycle()
    val i = planes.indexOfFirst { it.hex.equals(hex, ignoreCase = true) }
    val plane = planes.getOrNull(i)
    if (plane == null) {
        Head(ink(MapStyle.TRAFFIC_FAR), stringResource(R.string.traffic), stringResource(R.string.traffic_gone))
        return
    }
    val mark = marks.getOrNull(i)
    Head(
        ink(if (mark?.near == true) MapStyle.TRAFFIC_NEAR else MapStyle.TRAFFIC_FAR),
        listOfNotNull(plane.name, plane.type).joinToString(" · "),
        plane.registration?.takeIf { it != plane.name },
    )
    ProblemLine(trafficProblem)
    ProblemLine(watchProblem)
    // Its figures at a glance, as the planner hears them: altitude,
    // groundspeed and track, each its name over it (Figure), the way a
    // health app's top figures sit; a figure not heard is a dash.
    Row(Modifier.fillMaxWidth()) {
        Figure(stringResource(R.string.fact_altitude), plane.altitudeFt?.let(Format::altitude) ?: Format.NONE)
        Figure(stringResource(R.string.fact_ground_speed), plane.speedKt?.let(Format::speed) ?: Format.NONE)
        Figure(stringResource(R.string.fact_track), plane.trackDeg?.let { "${Format.heading(it)} true" } ?: Format.NONE)
    }
    mark?.label?.takeIf { it.isNotEmpty() }?.let { Fact(stringResource(R.string.fact_height), it) }
    // The tower's departure event, where TDES sent one.
    DepartureLine(plane.callsign ?: plane.registration)
    // Track is the card's one action, filled, where every card's first
    // action sits (CardButtonGroup).
    val isTracked = tracked == hex.lowercase()
    val trackWord = stringResource(if (isTracked) R.string.stop_tracking else R.string.track)
    CardButtonGroup(listOf(GroupAction(trackWord, null, filled = true) { tracking.track(if (isTracked) null else hex, plane) }), Modifier.fillMaxWidth())
    val source by traffic.source.collectAsStateWithLifecycle()
    Text(Traffic.credit(source), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
