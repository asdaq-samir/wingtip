package app.wingtipmaps.android.live

import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.AirportAtis
import app.wingtipmaps.android.api.generated.AirportRvr
import app.wingtipmaps.android.api.generated.AirspaceAt
import app.wingtipmaps.android.api.generated.DepartureEvents
import app.wingtipmaps.android.api.generated.FlowAtAirports
import app.wingtipmaps.android.api.generated.SaaStatuses
import app.wingtipmaps.android.api.airspaceAt
import app.wingtipmaps.android.api.liveAtis
import app.wingtipmaps.android.api.liveDepartures
import app.wingtipmaps.android.api.liveFlow
import app.wingtipmaps.android.api.liveRvr
import app.wingtipmaps.android.api.liveSaa
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.ceilingVisibility
import app.wingtipmaps.android.engine.generated.rvrCheck
import app.wingtipmaps.android.engine.generated.windCalm
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** Where the live reports come from: the planner's /api/live calls, a
 *  fake in the tests. */
interface LiveSource {
    suspend fun atis(airport: String): AirportAtis
    suspend fun rvr(airport: String): AirportRvr
    suspend fun flow(airports: List<String>): FlowAtAirports
    suspend fun saa(designators: List<String>): SaaStatuses
    suspend fun departures(ident: String): DepartureEvents
    suspend fun airspaceAt(lat: Double, lon: Double): AirspaceAt
}

object PlannerLive : LiveSource {
    override suspend fun atis(airport: String) = Planner.liveAtis(airport)
    override suspend fun rvr(airport: String) = Planner.liveRvr(airport)
    override suspend fun flow(airports: List<String>) = Planner.liveFlow(airports)
    override suspend fun saa(designators: List<String>) = Planner.liveSaa(designators)
    override suspend fun departures(ident: String) = Planner.liveDepartures(ident)
    override suspend fun airspaceAt(lat: Double, lon: Double) = Planner.airspaceAt(lat, lon)
}

/** The engine's rules the live rows ask, by name (the generated calls):
 *  a fake in the tests, which have no engine. */
interface LiveRules {
    /** Calm, a speed of 0 (AIM 7-1-28): wind_calm. */
    fun calm(kt: Int?): Boolean

    /** The ceiling of the layers, ft: ceiling_visibility (14 CFR 1.1). */
    fun ceilingFt(layers: List<EngineContract.CeilingVisibilityInputLayersItem>): Double?

    /** Each runway's reading under the pilot's minimum (rvr_check,
     *  14 CFR 91.175(h)(2)), in the order given; null not judged. */
    fun rvrUnder(runways: List<EngineContract.RvrCheckInputRunwaysItem>, minimumSm: Double?): List<Boolean?>
}

object EngineLive : LiveRules {
    override fun calm(kt: Int?): Boolean = Engine.windCalm(kt?.toDouble()).getOrDefault(false)

    override fun ceilingFt(layers: List<EngineContract.CeilingVisibilityInputLayersItem>): Double? =
        Engine.ceilingVisibility(layers = layers).getOrNull()?.ceilingFt

    override fun rvrUnder(runways: List<EngineContract.RvrCheckInputRunwaysItem>, minimumSm: Double?): List<Boolean?> =
        Engine.rvrCheck(runways, minimumSm = minimumSm).getOrNull()?.runways?.map { it.under }.orEmpty()
}

/** The planner's reading of a broadcast (the engine's read_datis, passed
 *  on as a plain object) in the contract's type. */
private val reader = Json { ignoreUnknownKeys = true; explicitNulls = false }

fun readingOf(reading: JsonObject): AtisReading? = runCatching { reader.decodeFromJsonElement(AtisReading.serializer(), reading) }.getOrNull()
