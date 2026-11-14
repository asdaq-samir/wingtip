package app.wingtipmaps.android.ai.functions

import android.app.Application
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.aircraft
import app.wingtipmaps.android.api.generated.GoNoGo
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.NotamsRankedAsk
import app.wingtipmaps.android.api.logbook
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.api.notamsRanked
import app.wingtipmaps.android.emergency.PhoneFields
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.flight.FlightSession
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.plan.KeptPlan
import app.wingtipmaps.android.search.FieldMarks
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant

/**
 * What the app does for an agent -- Gemini through AppFunctions
 * (WingtipFunctions), Gemini Nano through the on-phone Ask's tools
 * (AgentTools) -- in one place, so both get the same answers. Each reads
 * what the screens read: the planner for a field and the route's NOTAMs,
 * else the copies kept for the air (KeptForAir) and the cycle packs'
 * fields (PhoneFields) with no signal; the gateway for the pilot's
 * airplanes and logbook, the plan kept on the phone, and the Brief kept
 * for the air. Nothing here works a figure out:
 * every number is the planner's or the engine's as it came. An action
 * that changes the screen only says which link opens it; the caller opens
 * it (a PendingIntent for Gemini, the activity for the app's own Ask).
 */
class WingtipActions(private val app: Application) {
    /** The flight's one owner, from Hilt's component: neither the
     *  AppFunctions service nor the on-phone Ask is built by Hilt. */
    private val flight by lazy { FlightSession.from(app) }

    /** A field's card, by its ident. */
    suspend fun airport(ident: String): AirportEntity {
        val p = place(ident)
        val runways = p.runways.map { r ->
            listOfNotNull(r.ends, r.lengthFt?.let { "%,d ft".format(it) }, r.surface?.lowercase(), "closed".takeIf { r.closed }).joinToString(" ")
        }
        return AirportEntity(
            ident = p.ident, name = p.name, place = listOfNotNull(p.municipality, p.region).joinToString(", "),
            elevationFt = p.elevationFt, metar = p.metar?.raw, taf = p.taf, flightCategory = p.metar?.flightCategory,
            runways = runways, towered = p.towered, link = AgentLinks.place(p.ident), closed = FieldMarks.closed(p.closed),
        )
    }

    /** Fields whose ident, name or town match the words, a closed one
     *  labelled and after the open ones (decision 0043). */
    suspend fun search(query: String): List<AirportEntity> = found(Planner.search(query.trim()))

    /** The fields nearest the airplane's last position, nearest first:
     *  the planner's, else the cycle packs' on the phone (PhoneFields), with
     *  no flight category or runway. */
    suspend fun nearest(): List<NearestEntity> {
        val (lat, lon) = flight.ownShip.lastPosition ?: throw NoAnswer("The phone has no position yet.")
        val fields = try {
            Planner.nearest(lat, lon, MAX_LIST)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            withContext(Dispatchers.Default) { PhoneFields.near(CyclePacks.of(app), lat, lon, MAX_LIST) }?.let(PhoneFields::nearestRows)?.ifEmpty { null } ?: throw e
        }
        return fields.map { n ->
            NearestEntity(n.ident, n.name, n.distanceNm, n.bearingDeg, n.flightCategory, n.longestRunwayFt, AgentLinks.place(n.ident))
        }
    }

    suspend fun frequencies(ident: String): List<FrequencyEntity> {
        val p = place(ident)
        return p.frequencies.mapNotNull { f ->
            f.frequencyMhz?.let { FrequencyEntity(p.ident, f.description ?: f.type.orEmpty(), Format.frequency(it)) }
        }
    }

    suspend fun approaches(ident: String): List<ApproachEntity> {
        val p = place(ident)
        return p.procedures.orEmpty().map { ApproachEntity(p.ident, it.name, it.kind) }
    }

    /** The route on the page, as kept for the next launch. */
    fun route(): RouteEntity {
        val kept = KeptPlan(app).read()?.takeIf { it.dep.isNotEmpty() && it.dest.isNotEmpty() } ?: throw NoAnswer("No route is planned.")
        val points = listOf(kept.dep) + kept.stops + kept.dest
        return RouteEntity(
            dep = kept.dep, dest = kept.dest, waypoints = points.mapIndexed { i, id -> WaypointEntity(id, i) },
            airplane = kept.aircraft, altitudeFt = kept.altitudeFt, distanceNm = kept.totals?.distanceNm ?: kept.course?.distanceNm,
            eteMin = kept.totals?.eteMin, fuelGal = kept.totals?.fuelGal, depart = kept.depart,
            link = AgentLinks.route(kept.dep, kept.dest, kept.stops),
        )
    }

    /** The route's NOTAMs, ranked by the engine for this flight, the ones
     *  it puts on top first. */
    suspend fun notams(): List<NotamEntity> {
        val r = route()
        val stops = r.waypoints.drop(1).dropLast(1).map { it.ident }
        // Kept for the air under the flight's key (Keep for the Air, Ready
        // to fly), and read from there with no signal.
        val ranked = KeptForAir.had(KeptForAir.NOTAMS, flightKey(r.dep, stops, r.dest), NotamsRanked.serializer()) {
            Planner.notamsRanked(NotamsRankedAsk(altitudeFt = r.altitudeFt, dep = r.dep, dest = r.dest, stops = stops.ifEmpty { null }))
        }.value
        return ranked.notams.sortedBy { it.rank }.take(MAX_LIST).map { NotamEntity(it.id, it.field, it.keyword, it.closed, it.rank, it.raw) }
    }

    /** The Brief's verdict last worked out for the route on the page. */
    fun brief(): BriefEntity {
        val r = route()
        val key = flightKey(r.dep, r.waypoints.drop(1).dropLast(1).map { it.ident }, r.dest)
        val entry = KeptForAir.of(app).read(KeptForAir.GO_NO_GO, key) ?: throw NoAnswer("The Brief has not been worked out for this route yet.")
        val brief = Gateway.json.decodeFromString(GoNoGo.serializer(), entry.body)
        return BriefEntity(
            verdict = brief.line.words, finding = brief.line.finding,
            findings = brief.items.map { "${it.label}: ${it.detail}" }, workedOutAt = Instant.ofEpochMilli(entry.fetchedAtMs).toString(),
        )
    }

    suspend fun airplanes(): List<AirplaneEntity> =
        (Gateway.aircraft() ?: throw NoAnswer("Sign in to read your airplanes.")).map {
            AirplaneEntity(it.tailNumber, it.typeDesignator, it.cruiseTasKt, it.fuelBurnGph)
        }

    suspend fun logbook(count: Int): List<LogbookEntryEntity> =
        (Gateway.logbook() ?: throw NoAnswer("Sign in to read your logbook.")).sortedByDescending { it.flownOn }.take(count.coerceIn(1, MAX_LIST)).map {
            LogbookEntryEntity(
                it.flownOn, it.aircraft ?: it.aircraftType, it.route, it.totalHours, it.nightHours, it.instrumentHours,
                it.dayLandings, it.nightLandings, it.approaches, it.remarks,
            )
        }

    /** A screen by its id (design/screens.json), as the link that opens it. */
    fun screen(id: String): Opening {
        val screen = Screen.of(id.trim().lowercase()) ?: throw NoAnswer("The app has no screen \"$id\".")
        return Opening("Opening ${screen.title}.", AgentLinks.screen(screen))
    }

    /** A route to plan, refused where NASR lists one of its fields as
     *  closed (decision 0043): a closed field is never planned to land at
     *  or leave from. A field whose card cannot be had is not judged here;
     *  the plan's Go / No-Go says it. */
    suspend fun plan(dep: String, dest: String, stops: List<String>): Opening {
        val from = clean(dep)
        val to = clean(dest)
        if (from.isEmpty() || to.isEmpty()) throw NoAnswer("A route needs a departure and a destination.")
        val via = stops.map(::clean).filter { it.isNotEmpty() }
        val closed = (listOf(from) + via + to).distinct().associateWith { id ->
            try {
                place(id).closed
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
        }
        refusal(closed)?.let { throw NoAnswer(it) }
        return Opening("Planning ${(listOf(from) + via + to).joinToString(" ")}.", AgentLinks.route(from, to, via))
    }

    fun showAirport(ident: String): Opening = clean(ident).let { Opening("Opening $it.", AgentLinks.place(it)) }

    /** What opens, in words, and the link that opens it. */
    data class Opening(val said: String, val link: String)

    /** Why an action has no answer, in words the agent can say. */
    class NoAnswer(message: String) : Exception(message)

    private fun clean(ident: String): String = ident.trim().uppercase()

    /** A field's card: the planner's, kept as it comes, else the one kept
     *  on the phone (the airport card's and Keep for the Air's). */
    private suspend fun place(ident: String): AirportPlace =
        clean(ident).let { id -> KeptForAir.had(KeptForAir.AIRPORTS, id, AirportPlace.serializer()) { Planner.place(id) }.value }

    /** The flight's key, as Ready to fly keeps its answers (ReadyFacts.flightKey). */
    private fun flightKey(dep: String, stops: List<String>, dest: String): String = listOf(dep, stops.joinToString(","), dest).joinToString("|")

    companion object {
        /** The most a list answers with: what an agent can read out. */
        const val MAX_LIST = 10

        /** The planner's search answer as the agent's fields: at most
         *  MAX_LIST, a closed field labelled and listed after the open
         *  ones, as the search rows have it. */
        fun found(suggestions: List<AirportSuggestion>): List<AirportEntity> =
            suggestions.sortedBy { FieldMarks.closed(it.closed) != null }.take(MAX_LIST).map { s ->
                AirportEntity(
                    ident = s.ident, name = s.name, place = listOfNotNull(s.municipality, s.region).joinToString(", "),
                    elevationFt = null, metar = null, taf = null, flightCategory = null, runways = emptyList(), towered = false,
                    link = AgentLinks.place(s.ident), closed = FieldMarks.closed(s.closed),
                )
            }

        /** Why a route cannot be planned, by each field's closed label
         *  (the planner's, from NASR's ARPT_STATUS); null where every field
         *  is open or not known to be closed. */
        fun refusal(closed: Map<String, String?>): String? =
            closed.entries.firstOrNull { FieldMarks.closed(it.value) != null }?.let { (ident, label) ->
                "$ident is ${label!!.trim().lowercase()} (NASR): it cannot be planned as a landing field."
            }
    }
}
