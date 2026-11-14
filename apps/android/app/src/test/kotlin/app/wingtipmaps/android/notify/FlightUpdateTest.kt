package app.wingtipmaps.android.notify

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Live Update's content and words, as the iPhone's
 *  FlightActivityTests hold its Live Activity's: the engine's figures
 *  carried, the fuel only with an airplane picked, nothing on the ground. */
class FlightUpdateTest {
    private fun answer(burnt: Double = 4.0) = EngineContract.InFlightAnswer(
        onRoute = true, alongNm = 25.0, totalNm = 100.0, leftNm = 75.0, offNm = 0.2,
        desiredTrackDeg = 90.0, burntGal = burnt, fuelNowGal = 36.0,
        next = EngineContract.InFlightAnswerNext(index = 1, name = "PIPER", distanceNm = 12.0, bearingDeg = 91.0, eteMin = 12.0),
        destination = EngineContract.InFlightAnswerDestination(index = 3, name = "KDLH", distanceNm = 75.0, bearingDeg = 88.0, eteMin = 65.0, etaS = 1_793_620_000.0),
    )

    private fun update(airplane: Boolean = true, underway: Boolean = true, nowMs: Long = 0L) =
        FlightUpdate.of(answer(), underway, dep = "C81", dest = "KDLH", airplaneChosen = airplane, nowMs = nowMs)

    @Test
    fun carriesTheEnginesFigures() {
        val u = update()!!
        assertEquals("Next PIPER in 12m", u.title)
        assertEquals("12m", u.chip)
        assertEquals("1h 5m · 75.0 nm to KDLH · 36.0 gal planned left", u.text)
        assertEquals(250, u.progress(1000))
        assertEquals(1_793_620_000_000L, u.etaMs)
    }

    @Test
    fun noFuelWithoutAnAirplane() {
        val u = update(airplane = false)!!
        assertNull(u.fuelLeftGal)
        assertEquals("1h 5m · 75.0 nm to KDLH", u.text)
    }

    @Test
    fun nothingOnTheGround() {
        assertNull(update(underway = false))
        assertNull(FlightUpdate.of(null, true, "C81", "KDLH", true, 0L))
    }

    @Test
    fun postedOnANewPointOrEveryFewSeconds() {
        val first = update(nowMs = 0L)!!
        assertTrue(FlightUpdate.due(first, null, 5_000L))
        assertFalse(FlightUpdate.due(update(nowMs = 1_000L)!!, first, 5_000L))
        assertTrue(FlightUpdate.due(update(nowMs = 5_000L)!!, first, 5_000L))
        assertTrue(FlightUpdate.due(update(nowMs = 1_000L)!!.copy(nextFix = "DLH"), first, 5_000L))
    }

    @Test
    fun theBarHasASegmentALegAndAPointAtEachWaypointBetween() {
        val u = FlightUpdate.of(answer(), true, "C81", "KDLH", true, 0L, legsNm = listOf(12.0, 38.0, 50.0))!!
        val bar = u.bar(1000)
        assertEquals(listOf(120, 380, 500), bar.segments)
        assertEquals(listOf(120, 500), bar.points)
        assertEquals(250, bar.progress)
        // No legs: one segment, the bar a tenth of a percent a step.
        assertEquals(FlightUpdate.Bar(listOf(1000), emptyList(), 250), update()!!.bar(1000))
    }

    @Test
    fun withNoTimeToGoTheChipIsTheMilesToTheNextPoint() {
        val u = update()!!.copy(nextEteMin = null, destEteMin = null, nextNm = 12.0)
        assertEquals("12.0 nm", u.chip)
        assertEquals("Next PIPER, 12.0 nm", u.title)
    }
}
