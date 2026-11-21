package app.wingtipmaps.android.plan

import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.generated.FuelStopSuggestion
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.fuelInTanks
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * The fuel in the tanks at each field of the route, as the web's timeline
 * draws a gauge at each one (the owner: "next to airport say ... fuel in
 * tanks"), every figure the engine's (`fuel_in_tanks`): at the departure
 * the fuel on board at engine start, full unless the pilot set their own;
 * the start, taxi and takeoff allowance and each leg's burn taken from
 * them after; fuelled again at each field landed at (full, or the pilot's
 * own), as the planner checks each flight; negative past empty, the
 * gallons short; low under the reserve of the flight each field is on.
 * And what the pilot set: the fuel as the airplane leaves
 * a field, sent as the planner's `tanks` ("C81:20,KMSN:0"), whose fuel
 * checks fly the same figure, and the stops Add Fuel Stops put in.
 */
object PlanTanks {
    /** The gauge at a field: what is in the tanks, what they hold, whether
     *  under the reserve, and the pilot's own figure there (null, full). */
    data class Tank(val gal: Double, val usable: Double, val low: Boolean, val own: Int?)

    /** Where a gauge stands: the departure (-1), a stop by its place, or
     *  the destination (`stops.size`). */
    data class At(val index: Int)

    /** One leg as the walk needs it: where it ends and its burn. */
    data class LegBurn(val to: String, val fuelGal: Double?)

    /** The tanks' figures the gauges are read against: the first flight's
     *  usable fuel and allowance, each flight's own reserve in order (day,
     *  night or IFR by its own times and rules: 14 CFR 91.151(a)(1), (a)(2),
     *  91.167(a)(3)), and under IFR the fuel on to the alternate the
     *  destination is held to too (91.167(a)(2)), as the web's tankFigures
     *  passes them; which is low is the engine's, never compared here. */
    data class Figures(val usableGal: Double, val taxiGal: Double, val reservesGal: List<Double?>, val alternateGal: Double? = null) {
        companion object {
            fun of(totals: NavLogTotals?): Figures? {
                totals ?: return null
                val flights = totals.hops?.map { it.totals }?.ifEmpty { null } ?: listOf(totals)
                val usable = flights.first().usableFuelGal?.takeIf { it > 0 } ?: return null
                return Figures(usable, flights.first().taxiGal ?: 0.0, flights.map { it.reserveGal }, totals.alternate?.fuelGal)
            }
        }
    }

    data class State(val own: Map<String, Int> = emptyMap(), val fuelStops: List<String> = emptyList())

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** A field's fuel set on its gauge: gallons, 0 at a stop for none
     *  bought, null back to full. Plan.plan() plans it. */
    fun set(ident: String, gallons: Int?) = _state.update { s ->
        s.copy(own = if (gallons == null) s.own - ident.uppercase() else s.own + (ident.uppercase() to gallons))
    }

    fun addedFuelStops(idents: List<String>) = _state.update { it.copy(fuelStops = it.fuelStops + idents.map(String::uppercase)) }

    fun removedFuelStops() = _state.update { it.copy(fuelStops = emptyList()) }

    /** The route cleared: nothing of its fuel kept. */
    fun clear() = _state.update { State() }

    /** The nav log's `tanks` for what the pilot set, by the route's fields. */
    fun query(route: List<String>): Map<String, String?> {
        val on = route.map(String::uppercase).toSet()
        val words = _state.value.own.filterKeys { it in on }.toSortedMap().map { (ident, gal) -> "$ident:$gal" }.joinToString(",")
        return mapOf("tanks" to words.ifEmpty { null })
    }

    /**
     * The gauge at each field: each stop matched to the first leg after the
     * last that ends at it; where a stop matches none, no gauges at all,
     * since a walk that missed a fuelling would show wrong ones. `refuels`
     * says whether each stop is a field landed at (a fix is flown over).
     * `walk` is the engine's fuel_in_tanks, a parameter so a test can give it.
     */
    fun walk(
        legs: List<LegBurn>,
        dep: String,
        stops: List<String>,
        refuels: List<Boolean>,
        figures: Figures?,
        own: Map<String, Int>,
        walk: (List<EngineContract.FuelInTanksInputPointsItem>, Figures) -> Result<List<EngineContract.FuelInTanksAnswerItem?>> = { points, f ->
            Engine.fuelInTanks(points, f.usableGal, f.taxiGal, f.reservesGal, f.alternateGal)
        },
    ): Map<At, Tank> {
        if (figures == null || legs.isEmpty()) return emptyMap()
        val stopAtLeg = mutableMapOf<Int, Int>()
        var next = 0
        stops.forEachIndexed { i, stop ->
            val at = (next until legs.size).firstOrNull { legs[it].to.equals(stop, ignoreCase = true) } ?: return emptyMap()
            stopAtLeg[at] = i
            next = at + 1
        }
        fun ownAt(ident: String) = own[ident.uppercase()]
        fun refuel(stop: Int?) = stop != null && refuels.getOrElse(stop) { false }
        val points = listOf(EngineContract.FuelInTanksInputPointsItem(departure = true, refuel = false, fillGal = ownAt(dep)?.toDouble())) +
            legs.mapIndexed { i, leg ->
                val stop = stopAtLeg[i]
                EngineContract.FuelInTanksInputPointsItem(
                    departure = false,
                    fuelGal = leg.fuelGal,
                    refuel = refuel(stop),
                    fillGal = if (refuel(stop)) stop?.let { ownAt(stops[it]) }?.toDouble() else null,
                )
            }
        val walked = walk(points, figures).getOrNull() ?: return emptyMap()
        val tanks = mutableMapOf<At, Tank>()
        fun put(at: At, index: Int, own: Int?) {
            walked.getOrNull(index)?.let { tanks[at] = Tank(it.gal, figures.usableGal, it.low, own) }
        }
        put(At(-1), 0, ownAt(dep))
        stopAtLeg.forEach { (leg, stop) -> put(At(stop), leg + 1, if (refuel(stop)) ownAt(stops[stop]) else null) }
        put(At(stops.size), walked.size - 1, null)
        return tanks
    }

    /** The route with every flight's suggested fuel stops put in, each
     *  after its own flight's departure, and those that went in (the web's
     *  withFuelStops): a field already in the route not put in twice, a
     *  break left as the pilot's own pick. Null where none goes in. */
    fun withFuelStops(dep: String, stops: List<String>, suggested: List<FuelStopSuggestion>): Pair<List<String>, List<String>>? {
        val route = stops.toMutableList()
        val added = mutableListOf<String>()
        for (flight in suggested) {
            if (flight.reason == "break") continue
            val idents = flight.stops.map { it.ident }.filter { i -> !i.equals(dep, true) && route.none { it.equals(i, true) } }
            if (idents.isEmpty()) continue
            val after = if (flight.departure.equals(dep, true)) 0 else route.indexOfFirst { it.equals(flight.departure, true) } + 1
            route.addAll(after, idents)
            added += idents
        }
        return if (added.isEmpty()) null else route to added
    }

    /** "−12 gal": whole gallons rounded down, the minus past empty. */
    fun words(gal: Double): String {
        val whole = kotlin.math.floor(gal).toLong()
        return "${if (whole < 0) "−" else ""}${kotlin.math.abs(whole)} gal"
    }
}
