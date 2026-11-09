package app.wingtipmaps.android.ui

import app.wingtipmaps.android.live.DepartureLine
import app.wingtipmaps.android.live.SpecialUseRows

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.Traffic
import app.wingtipmaps.android.flight.Tracking
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import androidx.core.graphics.toColorInt

/**
 * The card of what was tapped on the map, as the web's map opens one in
 * its sheet (MapCard: AirspaceCardBody, VorCard, FixCard, WaypointCard,
 * the field's card, a traffic airplane's), in the one sheet with its
 * title and its close: what it is, the figures a pilot reads off it, each
 * from the tapped feature's own fields or the engine (MapRules), and the
 * card kind's actions (CardActionRow), the same set as the web's.
 */
@Composable
fun MapCardSheet(pick: MapPick, plan: Plan, onClose: () -> Unit) {
    val title = when (pick) {
        is MapPick.Airport -> pick.ident
        is MapPick.Airspace -> stringResource(R.string.airspace_class, pick.airspaceClass)
        is MapPick.Vor -> pick.ident
        is MapPick.Point -> pick.ident
        is MapPick.Plane -> pick.hex.uppercase()
    }
    val actions = rememberRouteActions(plan)
    // An action that changes the route closes the card, so the route is
    // seen being planned; Call, Address and Copy leave it open.
    val act: (CardAction, () -> Unit) -> Unit = { action, run ->
        run()
        if (action != CardAction.CALL && action != CardAction.ADDRESS && action != CardAction.COPY) onClose()
    }
    WingtipSheet(title = title, onClose = onClose) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Lg),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            when (pick) {
                is MapPick.Airport -> AirportCard(pick.ident, actions, act)
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
        headlineContent = { Text(name) },
        supportingContent = if (description) ({ Text(value) }) else null,
        trailingContent = if (description) null else ({ Text(value, style = MaterialTheme.typography.bodyLarge) }),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}

internal fun ink(hex: String) = Color(hex.toColorInt())

/** A field's card, asked of the planner as it opens (the web's airport
 *  card), with the airport card's actions. */
@Composable
private fun AirportCard(ident: String, actions: RouteActions, act: (CardAction, () -> Unit) -> Unit) {
    val place by produceState<Result<AirportPlace>?>(null, ident) {
        value = runCatching { Planner.place(ident) }
    }
    when (val got = place) {
        null -> CircularProgressIndicator(Modifier.size(WingtipSpace.Xl))
        else -> got.fold(
            { field ->
                CardActionRow(CardKind.AIRPORT, can = { actions.canAirport(it, field) }, onAction = { a -> act(a) { actions.airport(a, field) } })
                PlaceCard(field)
            },
            { ProblemLine(it.message) },
        )
    }
}

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
    mark?.label?.takeIf { it.isNotEmpty() }?.let { Fact(stringResource(R.string.fact_height), it) }
    plane.altitudeFt?.let { Fact(stringResource(R.string.fact_altitude), Format.altitude(it)) }
    plane.speedKt?.let { Fact(stringResource(R.string.fact_ground_speed), Format.speed(it)) }
    plane.trackDeg?.let { Fact(stringResource(R.string.fact_track), "${Format.heading(it)} true") }
    // The tower's departure event, where TDES sent one.
    DepartureLine(plane.callsign ?: plane.registration)
    HorizontalDivider()
    val isTracked = tracked == hex.lowercase()
    OutlinedButton(onClick = { tracking.track(if (isTracked) null else hex, plane) }, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(if (isTracked) R.string.stop_tracking else R.string.track))
    }
    val source by traffic.source.collectAsStateWithLifecycle()
    Text(Traffic.credit(source), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
