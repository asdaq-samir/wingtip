package app.wingtipmaps.android.alternate

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.generated.AlternateCheck
import app.wingtipmaps.android.api.generated.AlternateMinimums
import app.wingtipmaps.android.api.generated.Alternates
import app.wingtipmaps.android.api.generated.DestinationCheck
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The Brief's Alternate: asked of the planner as the web's useAlternate
 *  asks it, at the nav log's ETA and the airplane's cruise, and said in
 *  the web's words. */
class AlternateModelTest {
    @get:Rule val main = MainRule()

    private val totals = NavLogTotals(distanceNm = 120.0, eteMin = 90.0, legsWithoutWind = 0, unflyableLegs = 0)
    private val ifr = Plan.State(dep = "KDPA", dest = "KMSN", rules = "ifr", totals = totals, depart = "2026-11-10T14:00:00Z")
    private val answer = Alternates(
        destination = DestinationCheck(approach = true, ident = "KMSN", required = true, ceilingFt = 1200.0, visibilitySm = 3.0, reasons = listOf("Ceiling 1,200 ft at the ETA.")),
        alternate = AlternateCheck(approach = true, ident = "KRFD", precision = true, good = true, minimums = AlternateMinimums(600.0, 2.0)),
    )

    @Test
    fun askedAtTheEtaWithTheOneFiled() {
        var asked: List<Any?>? = null
        val model = AlternateModel(ask = { d, e, t, f -> asked = listOf(d, e, t, f); answer })
        model.check(AlternateModel.where(ifr, 120.0, PlanAlternate.Filed("KMSN", "KRFD")))
        assertEquals(listOf("KMSN", "2026-11-10T15:30:00Z", 120.0, "KRFD"), asked)
        assertEquals(answer, model.state.value.answer)
    }

    @Test
    fun nothingUnderVfr() {
        assertNull(AlternateModel.where(ifr.copy(rules = "vfr"), 120.0, null))
    }

    @Test
    fun withNoAirplaneItWaits() {
        var asked = false
        val model = AlternateModel(ask = { _, _, _, _ -> asked = true; answer })
        // No airplane: no cruise to reach an alternate at, and no stock one's (decision 0011).
        model.check(AlternateModel.where(ifr, null, null))
        assertFalse(asked)
        assertTrue(model.state.value.waiting)
    }

    @Test
    fun aFailureIsSaid() {
        val model = AlternateModel(ask = { _, _, _, _ -> throw java.io.IOException("down") })
        model.check(AlternateModel.where(ifr, 120.0, null))
        assertNotNull(model.state.value.problem)
        assertTrue(model.state.value.problem!!.startsWith("The alternate could not be checked"))
    }

    @Test
    fun standingInTheWebsWords() {
        val filed = AlternateCheck(approach = true, ident = "KRFD", precision = true, good = true, minimums = AlternateMinimums(600.0, 2.0))
        assertEquals("Meets 600-2", AlternateModel.standing(filed))
        assertEquals("Under its minimums", AlternateModel.standing(filed.copy(good = false)))
        assertEquals("Check it", AlternateModel.standing(filed.copy(good = null)))
    }
}
