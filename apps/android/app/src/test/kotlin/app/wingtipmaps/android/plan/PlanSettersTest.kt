package app.wingtipmaps.android.plan

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.airplane.AirplaneNow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The plan's own altitude and departure time as the nav log is asked
 *  them (the planner's `altitude_ft` and `depart`), and a departure time
 *  read back for the strip's times. */
class PlanSettersTest {
    @Test
    fun anAltitudeAndATimeGoInTheQuestion() {
        val q = Planner.navlogQuery("KDPA", "KMSN", listOf("KJVL"), mapOf("aircraft" to "c172"), altitudeFt = 4500.4, depart = "2026-11-14T15:00:00Z")
        assertEquals("4500", q["altitude_ft"])
        assertEquals("2026-11-14T15:00:00Z", q["depart"])
        assertEquals("KJVL", q["stops"])
    }

    @Test
    fun noneSetLeavesThemOutForThePlannersOwn() {
        val q = Planner.navlogQuery("KDPA", "KMSN", emptyList(), AirplaneNow.plannerQuery("", null))
        assertNull(q["altitude_ft"])
        assertNull(q["depart"])
        // No airplane is ever assumed: none asked (decision 0011).
        assertNull(q["aircraft"])
    }

    @Test
    fun aDepartureTimeIsReadWithItsOffset() {
        assertEquals(1_794_668_400_000L, Plan.departMs("2026-11-14T15:00:00Z"))
        assertEquals(1_794_668_400_000L, Plan.departMs("2026-11-14T09:00:00-06:00"))
        assertNull(Plan.departMs("Saturday morning"))
        assertNull(Plan.departMs(null))
    }
}
