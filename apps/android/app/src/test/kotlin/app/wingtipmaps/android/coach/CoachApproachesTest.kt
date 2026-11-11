package app.wingtipmaps.android.coach

import app.wingtipmaps.android.api.SavedTrack
import app.wingtipmaps.android.api.SavedTrackPoint
import app.wingtipmaps.android.api.generated.CoachFinding
import app.wingtipmaps.android.api.generated.CoachProfilePoint
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The coach's approaches from a saved track, on the JVM: the planner's
 *  drawing read as the engine's contract has it, the track's points as
 *  the engine reads them, and an approach's debrief trimmed to what
 *  proficiency_plan reads, as the web's coachDebriefs. The engine's
 *  approach_find itself is held on a phone (CoachApproachesEngineTest). */
class CoachApproachesTest {
    private val json = Json { ignoreUnknownKeys = true }

    /** KBUR's approaches as the planner draws them from the CIFP of 1 Oct
     *  2026 (approachKbur.json, the web's and the engine's fixture). */
    private fun planned(id: String): String {
        val text = checkNotNull(javaClass.classLoader!!.getResource("approachKbur.json")) { "approachKbur.json is not on the test's classpath" }.readText()
        return json.parseToJsonElement(text).jsonObject.getValue(id).toString()
    }

    @Test fun aProcedureAsThePlannerDrawsItIsReadAsTheEngineHasIt() {
        val d = CoachApproaches.drawing(planned("I08-Y"))
        assertEquals("KBUR", d.airport)
        assertEquals("ILS Y RWY 08", d.name)
        assertEquals(787.0, d.runwayPath!!.ft, 0.0)
        assertTrue(d.fixes!!.any { it.ident == "SILEX" })
    }

    @Test fun aSavedTracksPointsAreTheEnginesInMilliseconds() {
        val track = SavedTrack(points = listOf(SavedTrackPoint(altFt = 3000.0, lat = 34.2, lon = -118.6, t = 1_793_372_400_000)), source = "phone")
        assertEquals(listOf(EngineContract.TrackPoint(t = 1_793_372_400_000.0, lat = 34.2, lon = -118.6, altFt = 3000.0)), CoachApproaches.points(track))
    }

    @Test fun anApproachIsTrimmedToItsProfileFindingsAndElevation() {
        val flown = json.decodeFromString<EngineContract.ApproachDebrief>(
            """{"airport":"KBUR","id":"I08-Y","name":"ILS Y RWY 08","transition":null,"guidance":"localizer","faf_at":0,"fit_nm":0.01,
            "crossings":[],"findings":[{"tone":"stop","text":"Below the glide slope's full scale for 0.4 nm"},{"tone":"info","text":"Landed 20 s after the MAP"}],
            "plan":{"inbound":[],"missed":[],"fixes":[],"track":[]},"profile":{"track":[{"to_go_nm":1,"alt_ft":1100,"off":true}],"fixes":[]},
            "outcome":{"kind":"landed","seconds_after_map":20},"has_altitude":true,"also_fits":[],"way_in":{"fixes":0,"passed":0}}""",
        )
        val a = CoachApproaches.trimmed(flown, 778.0, "2026-10-30")
        assertEquals("approach", a.kind)
        assertEquals("KBUR", a.place)
        // The chart's name for it, so the coach says which approach.
        assertEquals("ILS Y RWY 08", a.procedure)
        assertEquals("2026-10-30", a.flownOn)
        assertEquals(778.0, a.elevationFt!!, 0.0)
        assertEquals(listOf(CoachProfilePoint(altFt = 1100.0, off = true, toGoNm = 1.0)), a.profile)
        assertEquals(
            listOf(CoachFinding(text = "Below the glide slope's full scale for 0.4 nm", tone = "stop"), CoachFinding(text = "Landed 20 s after the MAP", tone = "info")),
            a.findings,
        )
        assertEquals(emptyList<Any>(), a.legs)
        assertEquals(emptyList<Any>(), a.patterns)
        // No elevation is asked for, never assumed: the gate goes unchecked.
        assertNull(CoachApproaches.trimmed(flown, null, "2026-10-30").elevationFt)
    }
}
