package app.wingtipmaps.android.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.design.Haptics
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.route.RouteHome
import app.wingtipmaps.android.route.departFrom

/**
 * What a card's actions do with the route (Plan's route edits) and the
 * phone, and which of them each card can do now: Direct To wants the
 * airplane's position, Add to Route and Hold Here a route, Call a
 * telephone. Every card -- an airport's, a VOR's, a fix's, the
 * airspace's -- goes through here, so an action is one thing everywhere;
 * Direct To and Fly Here are felt as well (WingtipHaptic.DIRECT_TO).
 */
class RouteActions(
    private val plan: Plan,
    private val fix: OwnShip.Fix?,
    private val routed: Boolean,
    private val context: Context,
    private val haptics: Haptics? = null,
) {
    /** Where Fly Here starts: the airplane, else the route's departure;
     *  none, and the plan asks where from. */
    private val from: String? get() = fix?.let(Plan::positionIdent) ?: plan.state.value.dep.ifEmpty { null }

    fun canAirport(action: CardAction, place: AirportPlace?): Boolean = when (action) {
        CardAction.FLY_HERE, CardAction.DEPART_FROM -> place != null
        CardAction.ADD_STOP -> place != null && routed
        CardAction.CALL -> !place?.phone.isNullOrBlank()
        CardAction.ADDRESS -> place != null
        else -> false
    }

    fun airport(action: CardAction, place: AirportPlace) {
        when (action) {
            CardAction.FLY_HERE -> {
                plan.flyHere(place.ident, from.orEmpty())
                RouteHome.shared.flewTo(place.ident)
                haptics?.tap(WingtipHaptic.DIRECT_TO)
            }
            CardAction.DEPART_FROM -> plan.departFrom(place.ident)
            CardAction.ADD_STOP -> plan.addToRoute(Plan.ChartPoint(place.ident, place.lat, place.lon))
            CardAction.CALL -> place.phone?.let { CardIntents.call(context, it) }
            CardAction.ADDRESS -> CardIntents.address(context, place.lat, place.lon, place.address ?: place.name)
            else -> {}
        }
    }

    fun canPoint(action: CardAction, copyable: Boolean): Boolean = when (action) {
        CardAction.DIRECT_TO -> fix != null
        CardAction.ADD_TO_ROUTE, CardAction.HOLD_HERE -> routed
        CardAction.COPY -> copyable
        else -> false
    }

    /** A point's action; `copy` is what Copy puts on the clipboard (a
     *  VOR's frequency, a fix's name). */
    fun point(action: CardAction, point: Plan.ChartPoint, copy: Pair<String, String>?) {
        when (action) {
            CardAction.DIRECT_TO -> fix?.let {
                plan.directTo(point, it)
                haptics?.tap(WingtipHaptic.DIRECT_TO)
            }
            CardAction.ADD_TO_ROUTE -> plan.addToRoute(point)
            CardAction.HOLD_HERE -> plan.holdHere(point)
            CardAction.COPY -> copy?.let { (label, text) -> CardIntents.copy(context, label, text) }
            else -> {}
        }
    }

    companion object {
        /** The point a card is of, by its ident where it has one, else
         *  by its place as the planner reads one. */
        fun pointOf(pick: MapPick): Plan.ChartPoint? = when (pick) {
            is MapPick.Vor -> Plan.ChartPoint(pick.ident, pick.lat, pick.lon)
            is MapPick.Point -> Plan.ChartPoint(pick.ident, pick.lat, pick.lon)
            is MapPick.Airspace -> Plan.ChartPoint(String.format(java.util.Locale.US, "@%.4f,%.4f", pick.lat, pick.lon), pick.lat, pick.lon)
            is MapPick.Here -> Plan.ChartPoint(String.format(java.util.Locale.US, "@%.4f,%.4f", pick.lat, pick.lon), pick.lat, pick.lon)
            else -> null
        }

        /** What Copy puts on the clipboard: a VOR's frequency for the
         *  radio, a fix's or a waypoint's name for a flight plan. */
        fun copyOf(pick: MapPick): Pair<String, String>? = when (pick) {
            is MapPick.Vor -> pick.freq?.let { pick.ident to it }
            is MapPick.Point -> pick.ident to pick.ident
            else -> null
        }
    }
}

@Composable
fun rememberRouteActions(plan: Plan, flight: FlightModel = hiltViewModel()): RouteActions {
    val context = LocalContext.current
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    val haptics = rememberHaptics()
    return remember(plan, fix, state.routed, state.course) { RouteActions(plan, fix, state.routed && state.course != null, context, haptics) }
}
