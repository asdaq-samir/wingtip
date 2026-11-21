package app.wingtipmaps.android.plan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** The timeline's times: each point's landing and leaving from the
 *  departure and the planner's minutes, the zone said only once the route
 *  crosses one, and a stop's leave time picked as its minutes on the ground. */
class StopTimesTest {
    private val chicago = ZoneId.of("America/Chicago")
    private val denver = ZoneId.of("America/Denver")
    private val depart = Instant.parse("2026-11-21T15:00:00Z").toEpochMilli()
    private val legs = listOf(
        StopTimes.LegTime("BAE", 20.0, null),
        StopTimes.LegTime("KJVL", 25.0, 30.0),
        StopTimes.LegTime("KDEN", 120.0, null),
    )

    @Test
    fun eachPointLandsAndLeavesOnThePlannersMinutes() {
        val times = StopTimes.of(depart, legs, listOf("KJVL"))
        assertEquals(StopTimes.At(null, depart), times[-1])
        val landed = depart + 45 * 60_000L
        assertEquals(StopTimes.At(landed, landed + 30 * 60_000L), times[0])
        assertEquals(StopTimes.At(landed + 150 * 60_000L, null), times[1])
    }

    @Test
    fun noTimeAfterALegWithNone() {
        val times = StopTimes.of(depart, listOf(StopTimes.LegTime("KJVL", null, null)), listOf("KJVL"))
        assertNull(times[0])
        assertNull(times[1])
    }

    @Test
    fun theZoneIsSaidOnlyOnceTheRouteCrossesOne() {
        val times = StopTimes.of(depart, legs, listOf("KJVL"))
        assertFalse(StopTimes.zonesSaid(times, mapOf(-1 to chicago, 0 to chicago, 1 to chicago), device = chicago))
        assertTrue(StopTimes.zonesSaid(times, mapOf(-1 to chicago, 0 to chicago, 1 to denver), device = chicago))
        assertEquals("09:00", StopTimes.words(depart, chicago, said = false, device = chicago))
        assertEquals("08:00 MST", StopTimes.words(depart, denver, said = true, device = chicago))
    }

    @Test
    fun aStopsLeaveTimeIsItsMinutesOnTheGround() {
        // Landed 09:45 CST; leaving at 10:30 is 45 minutes down, at 09:00 the next morning.
        val landed = Instant.parse("2026-11-21T15:45:00Z").toEpochMilli()
        assertEquals(45, StopTimes.groundFor(landed, 10, 30, chicago))
        assertEquals(23 * 60 + 15, StopTimes.groundFor(landed, 9, 0, chicago))
    }
}
