package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.plan.PlanTanks
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** The stops Add Fuel Stops would put in, every flight's (PlanTanks.withFuelStops). */
val Plan.State.fuelStopsToAdd: Pair<List<String>, List<String>>?
    get() = PlanTanks.withFuelStops(dep, stops, totals?.fuelStops.orEmpty())

/** The fuel stops Add Fuel Stops put in that the route still has. */
fun Plan.State.fuelStopsIn(added: List<String>): List<String> = added.filter { a -> stops.any { it.equals(a, ignoreCase = true) } }

/**
 * Add Fuel Stops (the web's fuel stops pill): every flight's suggested
 * stops put in, then each plan of the route with them read in turn and
 * its own suggestions put in too, till one suggests none, four plans at
 * most (the web's FUEL_ROUNDS): the planner chooses the stops on the
 * flight as one, and each stop's flight is then planned on its own
 * altitude and winds, which is the real check. A route the pilot changes
 * meanwhile is left as they made it; a plan that takes over two minutes
 * ends it. Undone from its Snackbar as an added stop is.
 */
suspend fun Plan.addFuelStops() {
    repeat(FUEL_ROUNDS) {
        val now = state.value
        val (stops, added) = now.fuelStopsToAdd ?: return
        undoable(RouteUndo.Kind.ADDED, added.first())
        PlanTanks.addedFuelStops(added)
        plan(now.dep, now.dest, stops)
        val planned = withTimeoutOrNull(PLAN_WAIT_MS) { state.first { !it.planning } } ?: return
        if (planned.stops != stops.map(String::uppercase)) return
    }
}

/** Remove Fuel Stops: the ones Add Fuel Stops put in taken out. */
fun Plan.removeFuelStops() {
    val s = state.value
    val added = PlanTanks.state.value.fuelStops.toSet()
    undoable(RouteUndo.Kind.REMOVED, added.firstOrNull() ?: return)
    PlanTanks.removedFuelStops()
    plan(s.dep, s.dest, s.stops.filterNot { it.uppercase() in added })
}

private const val FUEL_ROUNDS = 4
private const val PLAN_WAIT_MS = 120_000L
