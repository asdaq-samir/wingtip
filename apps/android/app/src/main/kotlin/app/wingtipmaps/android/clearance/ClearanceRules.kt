package app.wingtipmaps.android.clearance

import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.ClearanceAsk
import app.wingtipmaps.android.api.generated.ClearancePlaces
import app.wingtipmaps.android.api.generated.SpokenProcedureAsk
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.altitudeSaid
import app.wingtipmaps.android.engine.generated.clearedRoute
import app.wingtipmaps.android.engine.generated.readClearance
import app.wingtipmaps.android.engine.generated.readbackCheck
import app.wingtipmaps.android.format.Format
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

/**
 * An ATC clearance as the phone heard it, read into its items by the
 * engine (wingtip_engine::clearance, `read_clearance`), the web's
 * lib/clearance and the iPhone's Clearance.swift, all held to the same
 * fixture (clearances.json): its limit, the route, the altitudes, the
 * frequency and the beacon code, as AIM 4-4-3 lists what a clearance
 * holds. The contract leaves the route's items open, so they are read
 * again here as ClearedItem, the same members by name.
 */
data class Clearance(val read: EngineContract.Clearance, val route: List<ClearedItem>) {
    /** Whether anything of a clearance was heard at all. */
    val heardAny: Boolean
        get() = read.limit != null || route.isNotEmpty() || read.asFiled || read.maintainFt != null || read.expectFt != null ||
            read.frequency != null || read.squawk != null || read.classB

    /** The planner's question for the clearance's places
     *  (/api/clearance/places): its limit, the route's phrases of places,
     *  its SID and STAR, near the route's points ("lat,lon;lat,lon"). */
    fun asked(near: String, dep: String, dest: String): ClearanceAsk {
        fun named(kind: String) = route.firstOrNull { it.kind == kind }?.let { SpokenProcedureAsk(name = it.name.orEmpty(), number = it.number.orEmpty(), transition = it.transition) }
        return ClearanceAsk(
            near = near, dep = dep.ifEmpty { null }, dest = dest.ifEmpty { null }, limit = read.limit,
            route = route.mapNotNull { if (it.kind == "places") it.said else null },
            departure = named("departure"), arrival = named("arrival"),
        )
    }

    /** Whether its places want looking up before the route is entered. */
    val wantsPlaces: Boolean
        get() = read.limit != null || route.any { it.kind == "places" || it.kind == "departure" || it.kind == "arrival" }
}

/** A part of the route in the order it was said: "vectors", "heading",
 *  "airway", "departure", "arrival", or "places" (words naming one place
 *  or more, for the planner to find). */
@Serializable
data class ClearedItem(
    val kind: String,
    val degrees: Int? = null,
    val ident: String? = null,
    val name: String? = null,
    val number: String? = null,
    val transition: String? = null,
    val said: String? = null,
)

/** The route a clearance gives: its ends, its stops, and the SIDs and
 *  STARs to pick with the points either side of them. */
data class Cleared(val dep: String, val stops: List<String>, val dest: String, val typed: List<EngineContract.ClearedRouteAnswerTypedItem>)

/** The engine's clearance rules the card asks: a fake in the tests. */
interface ClearanceRules {
    fun read(text: String): Result<Clearance>
    fun cleared(text: String, found: ClearancePlaces?, dep: String, stops: List<String>, dest: String): Result<Cleared>
    fun readback(cleared: String, said: String): Result<EngineContract.ReadbackCheckAnswer>
    /** An altitude as ATC says it and the app writes it (AIM 4-2-9). */
    fun altitude(ft: Int): String
}

object EngineClearance : ClearanceRules {
    override fun read(text: String): Result<Clearance> = Engine.readClearance(text).mapCatching { read ->
        Clearance(read, read.route.map { Engine.json.decodeFromJsonElement<ClearedItem>(it) })
    }

    /** The engine's `cleared_route`, the web's clearedRoute: from the words
     *  heard and the places found for them (the planner's answer is the
     *  contract's found places by name, so it is read across as JSON). */
    override fun cleared(text: String, found: ClearancePlaces?, dep: String, stops: List<String>, dest: String): Result<Cleared> =
        runCatching { found?.let { Engine.json.decodeFromJsonElement<EngineContract.ClearedRouteInputFound>(Engine.json.encodeToJsonElement(it)) } }
            .mapCatching { input -> Engine.clearedRoute(text, input, EngineContract.ClearanceRoute(dep, stops, dest)).getOrThrow() }
            .map { Cleared(it.route.dep, it.route.stops, it.route.dest, it.typed) }

    override fun readback(cleared: String, said: String) = Engine.readbackCheck(cleared, said)

    override fun altitude(ft: Int): String = Engine.altitudeSaid(ft.toDouble()).getOrNull() ?: Format.altitude(ft.toDouble())
}

/** The planner's finding of the places a clearance named, as idents
 *  near the route (POST /api/clearance/places, the engine's
 *  clearance_places rule). */
object ClearancePlanner {
    suspend fun places(ask: ClearanceAsk): ClearancePlaces = Planner.writes.clearancePlaces(ask).planned()
}
