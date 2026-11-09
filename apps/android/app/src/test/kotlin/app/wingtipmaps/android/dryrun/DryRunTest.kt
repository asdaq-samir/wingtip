package app.wingtipmaps.android.dryrun

import app.wingtipmaps.android.api.generated.TopOfClimb
import app.wingtipmaps.android.api.generated.TopOfDescent
import app.wingtipmaps.android.dryrun.DryRunFixtures.START
import app.wingtipmaps.android.dryrun.DryRunFixtures.course
import app.wingtipmaps.android.dryrun.DryRunFixtures.leg
import app.wingtipmaps.android.dryrun.DryRunFixtures.path
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The dry run's own parts: the nav log's rows as the engine reads them
 *  (the web's navLogRows), and where the airplane is and which row it
 *  flies to at a time (Replay.position, dryRunRow). */
class DryRunTest {
    @Test
    fun aRowPerEndAfterTheDeparture() {
        val rows = DryRunRows.of(course, listOf(leg("C81", "KMSN", 60.0, 30.0), leg("KMSN", "KDSM", 100.0, 60.0)))!!
        assertEquals(listOf("departure", "stop", "destination"), rows.map { it.kind })
        assertEquals(listOf("C81", "KMSN", "KDSM"), rows.map { it.airport?.ident })
        assertEquals(60.0, rows[1].leg!!["distance_nm"]!!.jsonPrimitive.double, 0.0)
        assertFalse(DryRunRows.heights(rows))
    }

    @Test
    fun noRowsUntilEveryLegIsIn() {
        assertNull(DryRunRows.of(course, listOf(leg("C81", "KMSN", 60.0))))
        assertNull(DryRunRows.of(course, emptyList()))
    }

    @Test
    fun aClimbAndADescentAreRowsOfTheirOwnWithTheirPieces() {
        val climbing = leg("C81", "KMSN", 60.0, 30.0).copy(
            toc = TopOfClimb(alongNm = 10.0, altitudeFt = 5500.0, eteMin = 7.0, fuelGal = 1.5, groundspeedKt = 80.0, lat = 42.4, lon = -88.3, tasKt = 85.0),
            tod = TopOfDescent(alongNm = 50.0, altitudeFt = 5500.0, eteMin = 25.0, fpm = 500.0, fuelGal = 4.0, lat = 43.0, lon = -89.1, pattern = true, toFt = 1900.0),
        )
        val rows = DryRunRows.of(course, listOf(climbing, leg("KMSN", "KDSM", 100.0, 60.0)))!!
        assertEquals(listOf("departure", "toc", "tod", "stop", "destination"), rows.map { it.kind })
        assertTrue(DryRunRows.heights(rows))
        fun part(i: Int, key: String) = rows[i].part!![key]!!.jsonPrimitive.double
        // Up to the top of climb at the climb's ground speed, then the cruise, then the descent.
        assertEquals(10.0, part(1, "distance_nm"), 1e-9)
        assertEquals(80.0, part(1, "groundspeed_kt"), 1e-9)
        assertEquals(40.0, part(2, "distance_nm"), 1e-9)
        assertEquals(18.0, part(2, "ete_min"), 1e-9)
        assertEquals(10.0, part(3, "distance_nm"), 1e-9)
        assertEquals(5.0, part(3, "ete_min"), 1e-9)
        assertEquals(1900.0, rows[2].point!!.toFt!!, 0.0)
    }

    @Test
    fun theAirplaneIsBetweenTheReportsEitherSide() {
        val fix = path.fixAt(START + 300)!!
        assertEquals(42.05, fix.lat, 1e-9)
        assertEquals(-88.25, fix.lon, 1e-9)
        assertEquals(1250.0, fix.altitudeFt!!, 1e-9)
        assertEquals(280.0, fix.trackDeg!!, 0.0)
        assertNull(path.fixAt(START - 1))
        assertNull(path.fixAt(path.endT + 1))
        // With no climb in the rows the height is not known.
        assertNull(path.copy(heights = false).fixAt(START + 300)!!.altitudeFt)
    }

    @Test
    fun theRowFlownToIsTheFirstNotYetReached() {
        assertEquals(0, path.rowAt(START - 60))
        assertEquals(0, path.rowAt(START))
        assertEquals(1, path.rowAt(START + 1))
        assertEquals(1, path.rowAt(START + 1800))
        assertEquals(2, path.rowAt(START + 1801))
        assertEquals(2, path.rowAt(START + 99_999))
    }
}
