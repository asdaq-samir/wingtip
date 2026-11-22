package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.api.generated.ProcedureSummary
import app.wingtipmaps.android.api.generated.Wind
import app.wingtipmaps.android.brief.BriefGlance
import app.wingtipmaps.android.plan.LandingRunway
import app.wingtipmaps.android.plan.PlanProcedures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/** The engine's rules this wave's Android screens ask through the
 *  bindings: the runway an approach lands on (landing_runway, the web's
 *  landingRunway.test cases) and the Brief's strongest headwind
 *  (route_headwind). */
@RunWith(AndroidJUnit4::class)
class BriefAndLandingEngineTest {
    private val ils09 = ProcedureList(
        airport = "KDLH", cycle = "2511",
        procedures = listOf(ProcedureSummary(id = "I09", kind = "approach", name = "ILS OR LOC RWY 09", runway = "09", runwayTransitions = emptyList(), transitions = emptyList())),
    )

    @Test
    fun anApproachLandsOnItsOwnRunwayWhateverWasPicked() {
        val picked = PlanProcedures.State(picks = listOf(PlanProcedures.Pick("KDLH", "I09", "approach", "ILS OR LOC RWY 09")))
        val own = LandingRunway.at(picked, "KDLH", ils09)!!
        assertEquals("9", own.runway)
        assertFalse(own.othersAllowed)
        assertEquals("9", LandingRunway.at(picked.copy(landings = mapOf("KDLH" to "27")), "KDLH", ils09)!!.runway)
        // No approach at the field: the menu stands as it was.
        assertNull(LandingRunway.at(PlanProcedures.State(), "KDLH", ils09))
    }

    private fun leg(from: String, to: String, course: Double, wind: Wind?) =
        Leg(altitudeFt = 5500.0, distanceNm = 50.0, from = from, magneticCourseDeg = course, magneticVariationDeg = 0.0, to = to, trueCourseDeg = course, wind = wind)

    @Test
    fun theStrongestHeadwindOfAnyLeg() {
        // Flying east into a 20-kt easterly is a 20-kt headwind; north in it, none.
        val legs = listOf(leg("A", "B", 0.0, Wind(windDirTrueDeg = 90.0, windSpeedKt = 20.0)), leg("B", "C", 90.0, Wind(windDirTrueDeg = 90.0, windSpeedKt = 20.0)))
        assertEquals(20.0, BriefGlance.headwind(legs)!!, 0.1)
        assertNull(BriefGlance.headwind(listOf(leg("A", "B", 90.0, null))))
    }
}
