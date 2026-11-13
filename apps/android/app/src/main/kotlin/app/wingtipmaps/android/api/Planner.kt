package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.GoNoGo
import app.wingtipmaps.android.api.generated.GoNoGoAsk
import app.wingtipmaps.android.api.generated.RouteProfile
import app.wingtipmaps.android.api.generated.client.apis.PlannerApi
import app.wingtipmaps.android.di.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.coroutines.executeAsync
import java.util.concurrent.TimeUnit

/**
 * The planner, through the gateway's proxy (`/api/planner/…`,
 * PlannerProxyController), with the pilot's session cookie as the
 * website's calls carry it, as the iOS app's Planner.swift has it. Its
 * calls are the Retrofit interface generated from its OpenAPI document
 * (PlannerApi, di/NetworkModule), each answer its generated model
 * (api/generated, named in Models.kt); `get` and `lines` are for what
 * that does not cover (a stream, a file's bytes).
 */
object Planner {
    /** FastAPI's `{"detail": "…"}`, where an answer carries one. */
    class Failure(val status: Int, val detail: String?) : Exception(detail ?: "The planner answered $status.")

    /** A planner call's address by its path and query, the query's keys
     *  sorted so the same question is the same address, and the same
     *  entry in the cache. */
    fun url(path: String, query: Map<String, String?> = emptyMap()): HttpUrl {
        val builder = (Config.gateway + Config.plannerPath(path)).toHttpUrl().newBuilder()
        for ((name, value) in query.toSortedMap()) {
            if (value != null) builder.addQueryParameter(name, value)
        }
        return builder.build()
    }

    fun get(path: String, query: Map<String, String?> = emptyMap()): Request =
        Request.Builder().url(url(path, query)).header("Accept", "application/json").build()

    /** How long a call made in the air waits for the planner, the whole
     *  call, before the phone answers from what it keeps (the cycle
     *  packs): five seconds, as the iOS app's Planner.inFlight. OkHttp's
     *  own waits are ten seconds to connect and ten between reads with no
     *  limit on the whole, so with one bar of signal the alert ahead,
     *  asked again every ten seconds, would be cancelled before it ever
     *  fell back. */
    const val IN_FLIGHT_MS = 5_000L

    /** The planner's generated calls, and the same for those made in the
     *  air, whose whole call waits no longer than IN_FLIGHT_MS. */
    val api: PlannerApi by lazy { NetworkModule.planner(Gateway.client) }
    val inFlight: PlannerApi by lazy { NetworkModule.planner(Gateway.client.newBuilder().callTimeout(IN_FLIGHT_MS, TimeUnit.MILLISECONDS).build()) }

    /** The planner's posts that work a while (the forecast run, the
     *  clearance's places, a debrief), on the gateway's write limit,
     *  Gateway.WRITE_TIMEOUT_S, as Gateway.call gave them. */
    val writes: PlannerApi by lazy { NetworkModule.planner(Gateway.client.newBuilder().callTimeout(Gateway.WRITE_TIMEOUT_S, TimeUnit.SECONDS).build()) }

    fun detail(body: String): String? =
        runCatching { (Gateway.json.parseToJsonElement(body) as? JsonObject)?.get("detail")?.jsonPrimitive?.contentOrNull }.getOrNull()

    /** An answer streamed a line at a time (newline-delimited JSON: the
     *  nav log), each line as sent, the empty ones left out. */
    fun lines(path: String, query: Map<String, String?> = emptyMap()): Flow<String> = flow {
        Gateway.streaming.newCall(get(path, query)).executeAsync().use { response ->
            if (response.code != 200) throw Failure(response.code, detail(response.body.string()))
            val source = response.body.source()
            while (true) {
                val line = source.readUtf8Line() ?: break
                if (line.isNotEmpty()) emit(line)
            }
        }
    }.flowOn(Dispatchers.IO)

    /** A route as every planner call takes it: its ends, and its stops
     *  joined where it has any. */
    fun route(dep: String, dest: String, stops: List<String>): Map<String, String?> =
        mapOf("dep" to dep, "dest" to dest, "stops" to stops.joinToString(",").ifEmpty { null })

    /** Which chart the map draws and where its tiles are (/api/chart). */
    suspend fun chart(): ChartInfo = api.chartInfo().planned()

    /** The cycle's overlay tiles' archive (/api/overlay-tiles); null where
     *  the planner has not built it yet (404, after the cycle pack). */
    suspend fun overlayTiles(): OverlayTiles? = api.overlayTiles().plannedOrNone()

    /** Fields by ident or name as they are typed (/api/airports/search). */
    suspend fun search(q: String): List<AirportSuggestion> =
        api.airportSearch(q = q).planned().airports

    /** A field's card: its weather, runways, frequencies and pattern
     *  (/api/airport/{ident}). */
    suspend fun place(ident: String): AirportPlace = api.airportPlace(ident).planned()

    /** The planner's airplane types (/api/aircraft-profiles), each by
     *  its summary. */
    suspend fun aircraftProfiles(): List<AircraftProfileSummary> =
        api.aircraftProfiles().planned().profiles

    /** The route as entered, its ends found and its line (/api/course). */
    suspend fun course(dep: String, dest: String, stops: List<String>): Course =
        api.course(dep, dest, stops.joinToString(",")).planned()

    /** The route's side view (/api/route-profile): the ground under it,
     *  and the airspace it passes through, floor to ceiling, as the web's
     *  and the iPhone's profiles draw it. */
    suspend fun routeProfile(dep: String, dest: String, stops: List<String>): RouteProfile =
        api.routeProfile(dep, dest, stops.joinToString(",")).planned()

    /** The nav log for a route, line by line as the planner sends them
     *  (/api/navlog), under the flight rules picked (the planner's
     *  altitudes by 14 CFR 91.159 or 91.179, or the pilot's own
     *  `altitudeFt` on every leg), for the airplane as
     *  AirplaneNow.plannerQuery asks it (its name and the pilot's own
     *  figures), leaving at `depart` (ISO 8601) or now; a line of a kind
     *  the app has no use for is left out. */
    fun navlog(
        dep: String,
        dest: String,
        stops: List<String>,
        airplane: Map<String, String?>,
        holds: List<String> = emptyList(),
        rules: String = "vfr",
        altitudeFt: Double? = null,
        depart: String? = null,
        altitudes: Map<String, String?> = emptyMap(),
    ): Flow<NavLogMessage> =
        lines("/api/navlog", navlogQuery(dep, dest, stops, airplane, holds, rules, altitudeFt, depart) + altitudes).mapNotNull { NavLog.decode(it) }

    /** The nav log's question: the route, the airplane (as
     *  AirplaneNow.plannerQuery asks it), the holds, the rules, and the
     *  pilot's own altitude and departure time where set (left out
     *  otherwise, for the planner's pick and its now). */
    fun navlogQuery(
        dep: String,
        dest: String,
        stops: List<String>,
        airplane: Map<String, String?>,
        holds: List<String> = emptyList(),
        rules: String = "vfr",
        altitudeFt: Double? = null,
        depart: String? = null,
    ): Map<String, String?> =
        route(dep, dest, stops) + airplane + ("holds" to holds.joinToString(",").ifEmpty { null }) + ("rules" to rules) +
            ("altitude_ft" to altitudeFt?.let { Math.round(it).toString() }) + ("depart" to depart)

    /** The Brief's Go / No-Go for the route (POST /api/go-no-go): the
     *  planner plans and briefs it and works the verdict out with the
     *  engine, as the web's Brief has it. */
    suspend fun goNoGo(ask: GoNoGoAsk): GoNoGo =
        api.goNoGo(ask).planned()
}
