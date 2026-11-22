package app.wingtipmaps.android.brief

import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.strip.Finding
import org.junit.Assert.assertEquals
import org.junit.Test

/** The Depart and Arrive rows' finding, read off the engine's runway
 *  check as the web's buildGlance reads it: a field not checked is not
 *  known, never fine; past the runway a stop; past the demonstrated
 *  crosswind or the POH's table a caution. */
class BriefFieldsTest {
    private fun distance(over: Boolean = false, unknown: Boolean = false, beyond: Boolean = false) =
        EngineContract.GonogoRunwayChecksAnswerItemDistancesItem(
            groundRollFt = 900.0, totalFt = 1600.0, caveats = emptyList(), kind = "takeoff", over = over, unknown = unknown, beyond = beyond,
        )

    private fun check(crosswindOver: Boolean = false, unchecked: String? = null, distance: EngineContract.GonogoRunwayChecksAnswerItemDistancesItem = distance()) =
        EngineContract.GonogoRunwayChecksAnswerItem(
            field = 0, role = "Departure", runway = 0, end = "36", picked = false, reported = true,
            headwindKt = 5.0, crosswindKt = 3.0, crosswindOver = crosswindOver, grass = false, unchecked = unchecked, distances = listOf(distance),
        )

    @Test
    fun theFindingIsTheChecksFlags() {
        assertEquals(Finding.OK, BriefFields.finding(check(), distance()))
        assertEquals(Finding.STOP, BriefFields.finding(check(), distance(over = true)))
        assertEquals(Finding.CAUTION, BriefFields.finding(check(crosswindOver = true), distance()))
        assertEquals(Finding.CAUTION, BriefFields.finding(check(), distance(beyond = true)))
        assertEquals(Finding.UNKNOWN, BriefFields.finding(check(unchecked = "the field's elevation is not known"), distance()))
        assertEquals(Finding.UNKNOWN, BriefFields.finding(check(), distance(unknown = true)))
        assertEquals(Finding.UNKNOWN, BriefFields.finding(null, null))
    }
}
