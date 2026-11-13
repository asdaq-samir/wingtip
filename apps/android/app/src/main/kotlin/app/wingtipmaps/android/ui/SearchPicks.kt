package app.wingtipmaps.android.ui

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.search.DoAction
import app.wingtipmaps.android.search.SearchPick

/**
 * What a tap in the one search does, the same in both layouts but for
 * where a field's card opens (`onAirport`: in the plan's sheet, or over
 * the strip): a field opens its card, where Fly Here, Depart From and Add
 * as Stop are; a fix or navaid goes into the route, or is flown direct to
 * with no route; an airplane opens its profile, where Fly This Airplane
 * is; an action runs. Opened for Add a Stop (`addingStop`), a field or a
 * fix picked is the route's next stop, before the destination (or after
 * the point it was opened from, `stopAfter`), and the plan shows it.
 * Opened for an airport field (`pickAirport`, the first flight's), a
 * field picked is handed to it. Route edits are Plan's, with their Undo.
 */
class SearchPicks(
    private val plan: Plan,
    /** The fix now, read at the pick rather than held, so the screen that
     *  makes this is not drawn again at every fix. */
    private val fix: () -> OwnShip.Fix?,
    private val addingStop: Boolean,
    private val stopAfter: String?,
    private val pickAirport: ((String) -> Unit)?,
    private val onAirport: (String) -> Unit,
    private val onPlan: () -> Unit,
    private val ask: (String) -> Unit,
    private val say: (String) -> Unit,
    private val noRoute: (String) -> String,
) {
    fun pick(picked: SearchPick) {
        when (picked) {
            is SearchPick.Airport -> when {
                pickAirport != null -> pickAirport(picked.ident)
                addingStop -> addStop(picked.ident)
                else -> onAirport(picked.ident)
            }
            is SearchPick.Waypoint -> {
                val now = fix()
                when {
                    addingStop || plan.state.value.routed -> addStop(picked.ident)
                    now != null -> directTo(picked.ident, now)
                    else -> say(noRoute(picked.ident))
                }
            }
            is SearchPick.Airplane -> ProfileOpen.open(picked.tail, type = picked.type)
            is SearchPick.Do -> when (val action = picked.action) {
                is DoAction.DirectTo -> fix()?.let { directTo(action.ident, it) }
                is DoAction.Open -> ScreenRequests.ask(action.screen)
                is DoAction.Ask -> ask(action.question)
            }
            SearchPick.Flight -> onPlan()
        }
    }

    private fun directTo(ident: String, at: OwnShip.Fix) {
        plan.directTo(ident, at)
        onPlan()
    }

    /** After the point asked, else the route's last stop: just before its
     *  destination. */
    private fun addStop(ident: String) {
        val s = plan.state.value
        if (!s.routed) {
            say(noRoute(ident))
            return
        }
        plan.addStopAfter(stopAfter ?: s.stops.lastOrNull() ?: s.dep, ident)
        onPlan()
    }
}
