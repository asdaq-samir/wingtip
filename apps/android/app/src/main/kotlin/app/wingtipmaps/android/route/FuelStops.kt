package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.plan.PlanTanks

/** The stops Add Fuel Stops would put in, every flight's (PlanTanks.withFuelStops). */
val Plan.State.fuelStopsToAdd: Pair<List<String>, List<String>>?
    get() = PlanTanks.withFuelStops(dep, stops, totals?.fuelStops.orEmpty())

/** The fuel stops Add Fuel Stops put in that the route still has. */
fun Plan.State.fuelStopsIn(added: List<String>): List<String> = added.filter { a -> stops.any { it.equals(a, ignoreCase = true) } }

/**
 * A flight short of fuel the planner offers no stop on, by its two ends,
 * and whether it is short already on board (the totals' `no_fuel_stop`,
 * the engine's `on_board_short`): said in the Fuel Stops row's place,
 * "No fuel stop in reach on KMSN → KDLH" or "Too little fuel on board for
 * C81 → KDLH" (14 CFR 91.151(a), 91.167(a); warn, never limit).
 */
data class NoFuelStop(val name: String, val onBoard: Boolean)

val Plan.State.noFuelStop: List<NoFuelStop>
    get() = totals?.noFuelStop.orEmpty().map { NoFuelStop("${it.departure} → ${it.destination}", it.onBoard == true) }

/**
 * Add Fuel Stops (the web's fuel stops pill): every flight's suggested
 * stops put in, in one plan. The planner itself plans the route again
 * with them in, each flight between two of them on its own altitude,
 * winds and burn, and puts in what those plans suggest too, till no
 * flight is short or after three plans more (claude/fuel-engine's
 * fuel_rounds), so the stops come back already checked and the phone
 * makes no rounds of its own. Undone from its Snackbar as an added stop is.
 */
fun Plan.addFuelStops() {
    val now = state.value
    val (stops, added) = now.fuelStopsToAdd ?: return
    undoable(RouteUndo.Kind.ADDED, added.first())
    PlanTanks.addedFuelStops(added)
    plan(now.dep, now.dest, stops)
}

/** Remove Fuel Stops: the ones Add Fuel Stops put in taken out. */
fun Plan.removeFuelStops() {
    val s = state.value
    val added = PlanTanks.state.value.fuelStops.toSet()
    undoable(RouteUndo.Kind.REMOVED, added.firstOrNull() ?: return)
    PlanTanks.removedFuelStops()
    plan(s.dep, s.dest, s.stops.filterNot { it.uppercase() in added })
}
