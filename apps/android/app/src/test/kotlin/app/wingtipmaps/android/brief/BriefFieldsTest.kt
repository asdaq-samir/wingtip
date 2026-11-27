package app.wingtipmaps.android.brief

import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.strip.Finding
import org.junit.Assert.assertEquals
import org.junit.Test

/** The Depart and Arrive rows' finding is the engine's runway check's
 *  own, read by its name; a field not checked is not known, never fine. */
class BriefFieldsTest {
    private val distance =
        EngineContract.GonogoRunwayChecksAnswerItemDistancesItem(
            groundRollFt = 900.0, totalFt = 1600.0, caveats = emptyList(), kind = "takeoff",
            over = false, unknown = false, beyond = false, close = false,
        )

    private fun check(finding: String) =
        EngineContract.GonogoRunwayChecksAnswerItem(
            field = 0, role = "Departure", runway = 0, end = "36", picked = false, reported = true,
            headwindKt = 5.0, crosswindKt = 3.0, crosswindOver = false, grass = false, distances = listOf(distance),
            finding = finding,
        )

    @Test
    fun theFindingIsTheEnginesOwn() {
        assertEquals(Finding.OK, BriefFields.finding(check("ok")))
        assertEquals(Finding.STOP, BriefFields.finding(check("stop")))
        assertEquals(Finding.CAUTION, BriefFields.finding(check("caution")))
        assertEquals(Finding.UNKNOWN, BriefFields.finding(check("unknown")))
        assertEquals(Finding.UNKNOWN, BriefFields.finding(null))
    }
}
