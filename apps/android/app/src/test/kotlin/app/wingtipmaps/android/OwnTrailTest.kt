package app.wingtipmaps.android

import app.wingtipmaps.android.flight.Geo
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.flight.OwnTrail
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.cos
import kotlin.math.hypot

/** The path flown's keep rules (OwnTrail), the web's and iOS's: a point
 *  every tenth of a mile or ten seconds at flying speed, none on the
 *  ground, a new flight after ten minutes, at most 5,000 points, and
 *  the file written and read back. Flying speed and the distance are
 *  given to the test (the engine's `underway` and `distance_nm` are not
 *  on the JVM): 20 kt and over, and a flat chart's miles, near enough
 *  over a tenth of a mile. The file is written at once (Unconfined), not
 *  behind as on the phone. */
class OwnTrailTest {
    private var clockMs = 1_700_000_000_000L
    private val file = File.createTempFile("own-trail", ".json").also { it.delete() }

    private val flat = Geo.Distance { lat1, lon1, lat2, lon2 -> Result.success(hypot(lat2 - lat1, (lon2 - lon1) * cos(Math.toRadians(lat1))) * 60) }

    private fun trail(distance: Geo.Distance = flat) = OwnTrail(file, underway = { (it ?: 0.0) >= 20.0 }, distance = distance, nowMs = { clockMs }, writing = Dispatchers.Unconfined)

    private fun fix(lat: Double, lon: Double, kt: Double, atMs: Long = clockMs) =
        OwnShip.Fix(lat = lat, lon = lon, altitudeFt = 3500.0, trackDeg = 90.0, groundspeedKt = kt, accuracyM = 5.0, atMs = atMs)

    @Test
    fun nothingIsKeptOnTheGround() {
        val trail = trail()
        assertFalse(trail.took(fix(42.0, -88.0, 5.0)))
        assertTrue(trail.points.value.isEmpty())
        assertFalse(trail.flying)
    }

    @Test
    fun aPointEveryTenthOfAMileOrTenSeconds() {
        val trail = trail()
        assertTrue(trail.took(fix(42.0, -88.0, 100.0)))
        // Two seconds on and 0.05 nm along: too soon and too near.
        clockMs += 2_000
        trail.took(fix(42.0, -88.0 + 0.05 / 60 / 0.743, 100.0))
        assertEquals(1, trail.points.value.size)
        // 0.12 nm along within the ten seconds: far enough.
        clockMs += 2_000
        trail.took(fix(42.0, -88.0 + 0.12 / 60 / 0.743, 100.0))
        assertEquals(2, trail.points.value.size)
        // The same place eleven seconds later: late enough.
        clockMs += 11_000
        trail.took(fix(42.0, -88.0 + 0.12 / 60 / 0.743, 100.0))
        assertEquals(3, trail.points.value.size)
    }

    @Test
    fun withNoDistanceTheTenSecondsAloneSpaceThePoints() {
        val trail = trail { _, _, _, _ -> Result.failure(IllegalStateException("no engine")) }
        trail.took(fix(42.0, -88.0, 100.0))
        clockMs += 2_000
        trail.took(fix(42.0, -87.9, 100.0))
        assertEquals(1, trail.points.value.size)
        clockMs += 9_000
        trail.took(fix(42.0, -87.9, 100.0))
        assertEquals(2, trail.points.value.size)
    }

    @Test
    fun aPointTenMinutesAfterTheLastStartsANewFlight() {
        val trail = trail()
        trail.took(fix(42.0, -88.0, 100.0))
        clockMs += 20_000
        trail.took(fix(42.1, -88.0, 100.0))
        assertEquals(2, trail.points.value.size)
        clockMs += 11 * 60_000
        trail.took(fix(43.0, -88.0, 100.0))
        assertEquals(listOf(43.0), trail.points.value.map { it.lat })
    }

    @Test
    fun atMostFiveThousandPointsAreKept() {
        val trail = trail()
        for (i in 0 until 5_100) {
            clockMs += 11_000
            trail.took(fix(42.0 + i * 0.001, -88.0, 100.0))
        }
        assertEquals(OwnTrail.MOST, trail.points.value.size)
        // The oldest went, the newest stayed.
        assertEquals(42.0 + 5_099 * 0.001, trail.points.value.last().lat, 1e-9)
    }

    @Test
    fun thePathIsWrittenAndReadBackWithinTenMinutes() {
        val trail = trail()
        trail.took(fix(42.0, -88.0, 100.0))
        clockMs += 31_000
        trail.took(fix(42.1, -88.0, 100.0))
        assertTrue(file.isFile)
        clockMs += 5 * 60_000
        assertEquals(2, trail().points.value.size)
        // Over ten minutes later it was another flight's.
        clockMs += 6 * 60_000
        assertTrue(trail().points.value.isEmpty())
    }

    @Test
    fun theSavedTrackIsInMillisecondsFromAndroid() {
        val trail = trail()
        trail.took(fix(42.0, -88.0, 100.0, atMs = 1_700_000_000_500L))
        val saved = trail.asSavedTrack
        assertEquals("android", saved.source)
        assertEquals(1_700_000_000_500L, saved.points.single().t)
        assertEquals(3500.0, saved.points.single().altFt!!, 1e-9)
    }
}
