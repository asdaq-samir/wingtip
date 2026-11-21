package app.wingtipmaps.android.plan

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.generated.gateway.FlightPlanFilingRequest
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.filedDof
import app.wingtipmaps.android.engine.generated.filedLevel
import app.wingtipmaps.android.engine.generated.filedRoute
import app.wingtipmaps.android.engine.generated.filedSpeed
import app.wingtipmaps.android.engine.generated.filedTimes

/**
 * The FAA's flight plan form filled in from the plan, FAA Form 7233-4,
 * which a domestic IFR flight files and every civil VFR flight plan is
 * filed on (AIM 5-1-5, 5-1-6), each item as AIM Appendix 4 writes it and
 * each written by the engine (`filed_speed`, `filed_level`,
 * `filed_route`, `filed_times`, `filed_dof`), the very rules the web's
 * flightPlanForm and the iPhone's FilingForm ask. A route that lands on
 * the way is one form a flight, as AIM 5-1-5 recommends for a stopover.
 * What the plan cannot say -- the persons on board, an item the airplane
 * has not given -- is the pilot's, typed on the page (PlanFilingPage).
 */
object PlanFiling {
    /** One flight of the route, landing to landing: its ends, the stops
     *  it flies through, and the legs that fly it. */
    data class Flight(val departure: String, val destination: String, val via: List<String>, val legs: List<Leg>)

    /** One flight's form: each item as it is written, null where the plan
     *  cannot say it. */
    data class Form(
        val rules: String,
        val aircraftId: String?,
        val aircraftType: String?,
        val departure: String,
        /** Item 13's time, an instant; only the first flight's is known. */
        val departTime: String?,
        val speed: String?,
        val level: String?,
        val route: String,
        val destination: String,
        val eet: String?,
        val eetMinutes: Int?,
        val alternate: String?,
        val other: String?,
        val endurance: String?,
        val enduranceMinutes: Int?,
    ) {
        /** What Flight Service is sent, where every item it needs is
         *  there; null where one is not (said on the page). */
        fun request(persons: Int?): FlightPlanFilingRequest? {
            val id = aircraftId ?: return null
            val type = aircraftType ?: return null
            val time = departTime ?: return null
            val eetMin = eetMinutes ?: return null
            val enduranceMin = enduranceMinutes ?: return null
            return FlightPlanFilingRequest(
                aircraftId = id, aircraftType = type, alternate = alternate, cruisingLevel = level ?: return null,
                cruisingSpeed = speed ?: return null, departure = departure, departureTime = time, destination = destination,
                eetMinutes = eetMin, enduranceMinutes = enduranceMin, otherInformation = other, personsOnBoard = persons,
                route = route, rules = rules,
            )
        }

        /** The form as text, an item to a line ("Item 15  Route: BAE V191
         *  OSH"), to paste into a filing service or read out. */
        fun text(persons: Int?): String = listOf(
            "$departure to $destination",
            "Item 8  Flight Rules: $rules",
            "Item 7  Aircraft Identification: ${aircraftId ?: NONE}",
            "Item 9  Type of Aircraft: ${aircraftType ?: NONE}",
            "Item 13  Departure: $departure",
            "Item 13  Departure Time (UTC): ${departTime?.let(::utcFigures) ?: NONE}",
            "Item 15  Cruising Speed: ${speed ?: NONE}",
            "Item 15  Cruising Level: ${level ?: NONE}",
            "Item 15  Route: $route",
            "Item 16  Destination: $destination",
            "Item 16  Total EET: ${eet ?: NONE}",
        ) + listOfNotNull(
            alternate?.let { "Item 16  Alternate: $it" },
            other?.let { "Item 18  Other Information: $it" },
        ) + listOf(
            "Item 19  Endurance: ${endurance ?: NONE}",
            "Item 19  Persons on Board: ${persons ?: NONE}",
        ).joinToString("\n")
    }

    /** The engine's filing rules, a parameter so a test can give them. */
    interface Rules {
        fun speed(tasKt: Double): String
        fun level(ft: Double): String
        fun route(via: List<String>, airways: List<String>): String
        fun times(eteMin: Double?, fuelGal: Double?, legs: List<Leg>): EngineContract.FiledTimesAnswer
        fun dof(depart: String, today: String): String?
    }

    object EngineRules : Rules {
        override fun speed(tasKt: Double) = Engine.filedSpeed(tasKt).getOrThrow()
        override fun level(ft: Double) = Engine.filedLevel(ft).getOrThrow()
        override fun route(via: List<String>, airways: List<String>) = Engine.filedRoute(via, airways).getOrThrow()
        override fun times(eteMin: Double?, fuelGal: Double?, legs: List<Leg>) =
            Engine.filedTimes(eteMin, fuelGal, legs.map { EngineContract.FiledTimesInputLegsItem(phase = it.phase, fuelBurnGph = it.fuelBurnGph) }).getOrThrow()
        override fun dof(depart: String, today: String) = Engine.filedDof(depart, today).getOrThrow()
    }

    /** Whether the plan can be filed: a route from an airport (a position
     *  is no item 13's departure) with its nav log in, as the web's File. */
    fun fileable(state: Plan.State): Boolean = state.totals != null && state.dep.isNotEmpty() && !state.dep.startsWith("@")

    /** A stop that is an airway (V191, T254, J60, Q100), not a place: the
     *  web's identSchema isAirwayToken. */
    fun isAirway(stop: String): Boolean = AIRWAY.matches(stop)

    /** The route's flights, landing to landing (the web's flights): the
     *  stops each flies through, and the legs that fly it, each flight's
     *  last leg the one that ends at its destination. */
    fun flights(dep: String, dest: String, stops: List<String>, landings: List<String>, legs: List<Leg>): List<Flight> {
        val ends = listOf(dep) + landings + dest
        val out = mutableListOf<Flight>()
        var at = 0
        var stop = 0
        for (i in 0 until ends.size - 1) {
            val destination = ends[i + 1]
            val last = i == ends.size - 2
            val via = mutableListOf<String>()
            while (stop < stops.size && (last || !stops[stop].equals(destination, ignoreCase = true))) via += stops[stop++]
            stop++
            val flown = mutableListOf<Leg>()
            while (at < legs.size) {
                val leg = legs[at++]
                flown += leg
                if (!last && leg.to.equals(destination, ignoreCase = true)) break
            }
            out += Flight(ends[i], destination, via, flown)
        }
        return out
    }

    /**
     * One flight's form: item 15's speed and level are its first leg's
     * (under IFR a step on the way is asked of ATC, AIM Appendix 4), item
     * 16's EET and item 19's endurance the engine's `filed_times` on the
     * flight's own time and fuel (the fuel set at its departure, else the
     * tanks' usable fuel), item 18's date of flight where not today, and
     * under IFR the alternate filed on the last flight.
     */
    fun form(
        flight: Flight,
        first: Boolean,
        last: Boolean,
        rules: String,
        aircraftId: String?,
        aircraftType: String?,
        depart: String?,
        totals: NavLogTotals?,
        fuelGal: Double?,
        alternate: String?,
        today: String,
        engine: Rules = EngineRules,
    ): Result<Form> = runCatching {
        val lead = flight.legs.firstOrNull()
        val ifr = rules.equals("ifr", ignoreCase = true)
        val times = engine.times(totals?.eteMin, fuelGal ?: totals?.usableFuelGal, flight.legs)
        val time = depart.takeIf { first }
        Form(
            rules = if (ifr) "IFR" else "VFR",
            aircraftId = aircraftId?.uppercase(),
            aircraftType = aircraftType?.uppercase(),
            departure = flight.departure,
            departTime = time,
            speed = lead?.tasKt?.let(engine::speed),
            level = lead?.let { engine.level(it.altitudeFt) },
            route = engine.route(flight.via, flight.via.filter(::isAirway)),
            destination = flight.destination,
            eet = times.eet,
            eetMinutes = times.eetMinutes,
            alternate = alternate?.takeIf { ifr && last },
            other = time?.let { engine.dof(it, today) },
            endurance = times.endurance,
            enduranceMinutes = times.enduranceMinutes,
        )
    }

    /** Item 13's time as filed, four UTC figures: "1530". */
    fun utcFigures(iso: String): String = runCatching {
        val at = java.time.Instant.parse(iso).atZone(java.time.ZoneOffset.UTC)
        String.format(java.util.Locale.US, "%02d%02d", at.hour, at.minute)
    }.getOrDefault(iso)

    /** Item 19's persons on board as typed: 1 to 999, the request's own
     *  limits; anything else is not said, and the item stays blank. */
    fun persons(typed: String): Int? = typed.trim().takeIf { it.length in 1..3 && it.all(Char::isDigit) }?.toInt()?.takeIf { it in 1..MAX_PERSONS }

    private val AIRWAY = Regex("^[VTJQ][0-9]{1,4}$")
    private const val MAX_PERSONS = 999
    private const val NONE = "—"
}
