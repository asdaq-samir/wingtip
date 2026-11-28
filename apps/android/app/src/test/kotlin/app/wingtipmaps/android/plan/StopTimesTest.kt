package app.wingtipmaps.android.plan

import app.wingtipmaps.android.format.Format
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
    fun aFixFlownOverHasNoLeaveTime() {
        val times = StopTimes.of(depart, legs, listOf("BAE", "KJVL"))
        assertEquals(StopTimes.At(depart + 20 * 60_000L, null), times[0])
        assertEquals(depart + 45 * 60_000L, times[1]?.arriveMs)
    }

    @Test
    fun noTimeAfterALegWithNone() {
        val times = StopTimes.of(depart, listOf(StopTimes.LegTime("KJVL", null, null)), listOf("KJVL"))
        assertNull(times[0])
        assertNull(times[1])
    }

    @Test
    fun anArrivalSaysItsDayWhereItIsNotTheDepartures() {
        // 14:27 CST on Monday 23 November 2026, as the owner's iPhone left.
        val left = Instant.parse("2026-11-23T20:27:00Z").toEpochMilli()
        val from = StopTimes.Left(left, chicago)
        fun at(iso: String) = Instant.parse(iso).toEpochMilli()
        assertEquals("09:00", StopTimes.words(depart, chicago, said = false, device = chicago, left = StopTimes.Left(depart, chicago)))
        assertEquals("Tue 15:54", StopTimes.words(left + 1527 * 60_000L, chicago, said = false, device = chicago, left = from))
        // Chicago's midnight, 06:00Z, turns the day, not UTC's.
        assertNull(Format.arrivalDay(at("2026-11-24T05:59:00Z"), left, chicago, chicago))
        assertEquals("Tue", Format.arrivalDay(at("2026-11-24T06:01:00Z"), left, chicago, chicago))
        // 23:30 MST on the Monday is still Monday where it lands.
        assertNull(Format.arrivalDay(at("2026-11-24T06:30:00Z"), left, denver, chicago))
        assertEquals("11/30", Format.arrivalDay(at("2026-11-30T20:00:00Z"), left, chicago, chicago))
        assertEquals("Tue 15:54 MST", StopTimes.words(at("2026-11-24T22:54:00Z"), denver, said = true, device = chicago, left = from))
    }

    /** With no zone said, the clock is this phone's, so the day it left is
     *  counted there too (the r7 audit's A-M2): a phone in Los Angeles
     *  leaving 01:00 EST Tuesday (22:00 PST Monday) says a same-day 23:00
     *  arrival with no day. */
    @Test
    fun theBareClocksDayIsThePhones() {
        val newYork = ZoneId.of("America/New_York")
        val la = ZoneId.of("America/Los_Angeles")
        val left = Instant.parse("2026-11-24T06:00:00Z").toEpochMilli()
        val lands = Instant.parse("2026-11-24T07:00:00Z").toEpochMilli()
        assertEquals("23:00", StopTimes.words(lands, la, said = false, device = la, left = StopTimes.Left(left, newYork)))
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
