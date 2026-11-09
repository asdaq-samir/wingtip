package app.wingtipmaps.android.coach

import app.wingtipmaps.android.api.generated.CoachLeg
import app.wingtipmaps.android.api.generated.CoachPattern
import app.wingtipmaps.android.api.generated.DebriefAnswer
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

/** The coach's debriefs from the saved flights: the planner's debrief
 *  trimmed to what the engine's proficiency_plan reads, and only the last
 *  half year's newest six flights asked for, as the web's coachDebriefs. */
class CoachDebriefsTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val tolerances = """"tolerances":{"altitude_ft":200,"course_deg":10,"eta_min":3,"off_route_nm":1,"pattern_ft":100,"pattern_nm":1}"""

    @Test fun aDebriefIsTrimmedToItsLegsAndPatterns() {
        val answer = json.decodeFromString<DebriefAnswer>(
            """{"debrief":{"flown_min":62,"has_altitude":true,"landing":2,"takeoff":1,"line":[],"notes":[],"passes":[],"planned":[],"profile":[],
            "legs":[{"from":"C81","to":"KMSN","ok":false,"altitude_within":0.4,"course_within":0.9}],
            "patterns":[{"ident":"KMSN","alt_ft":2400,"off_ft":-300,"ok":false,"pattern_ft":2700}]},$tolerances}""",
        )
        val d = CoachDebriefs.trimmed(answer, "C81-KMSN", "2026-10-20")!!
        assertEquals("flight", d.kind)
        assertEquals(listOf(CoachLeg(altitudeWithin = 0.4, courseWithin = 0.9, from = "C81", ok = false, to = "KMSN")), d.legs)
        assertEquals(listOf(CoachPattern(ident = "KMSN", offFt = -300.0, ok = false)), d.patterns)
    }

    @Test fun aTrackThatNeverFlewIsNoDebrief() {
        val answer = json.decodeFromString<DebriefAnswer>("""{"debrief":null,$tolerances}""")
        assertNull(CoachDebriefs.trimmed(answer, "C81-KMSN", "2026-10-20"))
    }

    @Test fun theFlightsAskedForAreTheHalfYearsNewestSix() {
        val now = Instant.parse("2026-11-09T12:00:00Z")
        val flights = (0 until 9).map { i ->
            val at = if (i < 8) "2026-11-0${i + 1}T12:00:00Z" else "2026-01-02T12:00:00Z"
            FlightSummaryDto(createdAt = at, departureIdent = "C81", destinationIdent = "KMSN", id = i.toLong(), stops = emptyList())
        }
        val picked = CoachDebriefs.recent(flights, now)
        assertEquals(6, picked.size)
        assertEquals(7L, picked.first().id)
        assertEquals(false, picked.any { it.id == 8L })
        assertEquals("2026-10-20", CoachDebriefs.dayOf(Instant.parse("2026-10-20T15:00:00Z").toEpochMilli(), ZoneOffset.UTC))
    }
}
