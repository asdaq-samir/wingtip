package app.wingtipmaps.android.coach

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.CoachDebrief
import app.wingtipmaps.android.api.generated.CoachLeg
import app.wingtipmaps.android.api.generated.CoachPattern
import app.wingtipmaps.android.api.generated.DebriefAnswer
import app.wingtipmaps.android.api.generated.DebriefAsk
import app.wingtipmaps.android.api.generated.DebriefCheckpoint
import app.wingtipmaps.android.api.generated.DebriefPoint
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.api.track
import kotlinx.coroutines.CancellationException
import java.time.Instant
import java.time.ZoneId

/**
 * The debriefs the coach reads, from the pilot's own saved flights, as the
 * web's coachDebriefs gathers them: each flight of the last half year with
 * a track saved to the account, the newest six, debriefed against its plan
 * by the planner (POST /api/debrief, the engine's debrief: its legs and
 * its pattern entries, ACS PA.VI.A and PA.III.B), trimmed to what the
 * engine's proficiency_plan reads, and each approach it flew into its
 * destination debriefed against the procedure by the engine's
 * approach_find (CoachApproaches). Nothing is judged here: the engine
 * finds what is weak in them.
 */
object CoachDebriefs {
    /** The newest flights looked at: a few weeks' flying. */
    const val MOST_FLIGHTS = 6
    /** The engine reads the debriefs of the last half year (its
     *  RECENT_DAYS); older flights are not fetched at all. */
    const val RECENT_DAYS = 183L

    /** The flights the coach looks at: the last half year's, newest first. */
    fun recent(flights: List<FlightSummaryDto>, now: Instant = AppClock.javaNow()): List<FlightSummaryDto> {
        val oldest = now.minusSeconds(RECENT_DAYS * 86_400)
        val whenOf = { f: FlightSummaryDto -> runCatching { Instant.parse(f.plannedFor ?: f.createdAt) }.getOrDefault(Instant.EPOCH) }
        return flights.filter { !whenOf(it).isBefore(oldest) }.sortedByDescending(whenOf).take(MOST_FLIGHTS)
    }

    /** The planner's debrief trimmed; null where the track never flew. */
    fun trimmed(answer: DebriefAnswer, place: String, flownOn: String): CoachDebrief? {
        val d = answer.debrief ?: return null
        return CoachDebrief(
            kind = "flight", flownOn = flownOn, place = place, profile = emptyList(), findings = emptyList(),
            legs = d.legs.map { CoachLeg(altitudeWithin = it.altitudeWithin, courseWithin = it.courseWithin, from = it.from, ok = it.ok, to = it.to) },
            patterns = d.patterns.map { CoachPattern(ident = it.ident, offFt = it.offFt, ok = it.ok) },
        )
    }

    /** The day a track flew, on the pilot's calendar. */
    fun dayOf(ms: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().toString()

    /** The debriefs of the newest flights with a track, each flight's
     *  approaches after it; a flight whose track or plan cannot be had is
     *  left out. */
    suspend fun fetch(): List<CoachDebrief> {
        val flights = quietly { Gateway.api.flightList().readOrNone() } ?: return emptyList()
        return recent(flights).flatMap { summary ->
            val track = quietly { Gateway.track(summary.id) } ?: return@flatMap emptyList()
            val first = track.points.firstOrNull() ?: return@flatMap emptyList()
            val flight = quietly { Gateway.api.flightGet(summary.id).readOrNone() } ?: return@flatMap emptyList()
            val flownOn = dayOf(first.t)
            val flown = quietly {
                val ask = DebriefAsk(
                    checkpoints = flight.checkpoints.map {
                        DebriefCheckpoint(it.alongTrackNm, it.altitudeFt, it.category, it.eteMin, it.lat, it.lon, it.name, it.sequenceNo, it.trueCourseDeg)
                    },
                    points = track.points.map { DebriefPoint(it.altFt, it.lat, it.lon, it.t.toDouble()) },
                )
                val answer = Planner.writes.debrief(ask).planned()
                trimmed(answer, "${flight.departureIdent}-${flight.destinationIdent}", flownOn)
            }
            listOfNotNull(flown) + CoachApproaches.fetch(flight.destinationIdent, track, flownOn)
        }
    }

    private suspend fun <T> quietly(read: suspend () -> T?): T? = try {
        read()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
}
