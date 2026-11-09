package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.AircraftProfiles
import app.wingtipmaps.android.api.generated.AirportSearch
import app.wingtipmaps.android.api.generated.GoNoGo
import app.wingtipmaps.android.api.generated.GoNoGoAsk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * The planner, through the gateway's proxy (`/api/planner/…`,
 * PlannerProxyController), with the pilot's session cookie as the
 * website's calls carry it, as the iOS app's Planner.swift has it. Each
 * answer decoded from the document's snake case into its generated model
 * (api/generated, named in Models.kt).
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

    /** An answer's body, or the planner's own words why not. Every planner
     *  call goes through here; `timeoutMs` bounds the whole call for those
     *  made in the air (IN_FLIGHT_MS). */
    suspend fun fetch(path: String, query: Map<String, String?> = emptyMap(), timeoutMs: Long? = null): String =
        Gateway.client.newCall(get(path, query)).also { call ->
            if (timeoutMs != null) call.timeout().timeout(timeoutMs, TimeUnit.MILLISECONDS)
        }.await().use { response ->
            val body = response.body?.string() ?: ""
            if (response.code != 200) throw Failure(response.code, detail(body))
            body
        }

    fun detail(body: String): String? =
        runCatching { (Gateway.json.parseToJsonElement(body) as? JsonObject)?.get("detail")?.jsonPrimitive?.contentOrNull }.getOrNull()

    /** An answer streamed a line at a time (newline-delimited JSON: the
     *  nav log), each line as sent, the empty ones left out. */
    fun lines(path: String, query: Map<String, String?> = emptyMap()): Flow<String> = flow {
        Gateway.client.newCall(get(path, query)).execute().use { response ->
            if (response.code != 200) throw Failure(response.code, detail(response.body?.string() ?: ""))
            val source = response.body?.source() ?: return@use
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
    suspend fun chart(): ChartInfo = Gateway.json.decodeFromString(fetch("/api/chart"))

    /** The cycle's overlay tiles' archive (/api/overlay-tiles); null where
     *  the planner has not built it yet (404, after the cycle pack). */
    suspend fun overlayTiles(): OverlayTiles? =
        try {
            Gateway.json.decodeFromString<OverlayTiles>(fetch("/api/overlay-tiles"))
        } catch (e: Failure) {
            if (e.status == 404) null else throw e
        }

    /** Fields by ident or name as they are typed (/api/airports/search). */
    suspend fun search(q: String): List<AirportSuggestion> =
        Gateway.json.decodeFromString<AirportSearch>(fetch("/api/airports/search", mapOf("q" to q))).airports

    /** A field's card: its weather, runways, frequencies and pattern
     *  (/api/airport/{ident}). */
    suspend fun place(ident: String): AirportPlace = Gateway.json.decodeFromString(fetch("/api/airport/$ident"))

    /** The planner's airplane types (/api/aircraft-profiles), each by
     *  its summary. */
    suspend fun aircraftProfiles(): List<AircraftProfileSummary> =
        Gateway.json.decodeFromString<AircraftProfiles>(fetch("/api/aircraft-profiles")).profiles

    /** The route as entered, its ends found and its line (/api/course). */
    suspend fun course(dep: String, dest: String, stops: List<String>): Course =
        Gateway.json.decodeFromString(fetch("/api/course", route(dep, dest, stops)))

    /** The nav log for a route, line by line as the planner sends them
     *  (/api/navlog), under the flight rules picked (the planner's
     *  altitudes by 14 CFR 91.159 or 91.179), for the airplane as
     *  AirplaneNow.plannerQuery asks it (its name and the pilot's own
     *  figures); a line of a kind the app has no use for is left out. */
    fun navlog(dep: String, dest: String, stops: List<String>, airplane: Map<String, String?>, holds: List<String> = emptyList(), rules: String = "vfr"): Flow<NavLogMessage> =
        lines(
            "/api/navlog",
            route(dep, dest, stops) + airplane + ("holds" to holds.joinToString(",").ifEmpty { null }) + ("rules" to rules),
        )
            .mapNotNull { NavLog.decode(it) }

    /** The Brief's Go / No-Go for the route (POST /api/go-no-go): the
     *  planner plans and briefs it and works the verdict out with the
     *  engine, as the web's Brief has it. */
    suspend fun goNoGo(ask: GoNoGoAsk): GoNoGo =
        Gateway.json.decodeFromString(Gateway.send("POST", Config.plannerPath("/api/go-no-go"), Gateway.json.encodeToString(ask)))
}
