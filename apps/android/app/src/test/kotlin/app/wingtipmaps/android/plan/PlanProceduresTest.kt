package app.wingtipmaps.android.plan

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the plan's line picks at the route's fields (PlanProcedures) and
 *  how the nav log is asked for them: the procedures through the engine's
 *  writer (given here, so no native library is needed), the runways and
 *  crossings as the planner's "IDENT:VALUE" pairs, only for the route's
 *  own fields, and the wind's runway wherever none is picked. */
class PlanProceduresTest {
    private val ils = PlanProcedures.Pick("KOSH", "I36", "approach", "ILS OR LOC RWY 36")
    private val rnav = PlanProcedures.Pick("KOSH", "R36", "approach", "RNAV (GPS) RWY 36")
    private val dep = PlanProcedures.Pick("KATW", "ATW1", "departure", "APPLETON ONE", "OSH")

    @After
    fun clear() = PlanProcedures.clear()

    @Test
    fun aPickReplacesItsKindAtItsFieldAndTakesItsDirectWithIt() {
        PlanProcedures.pick("KOSH", "approach", ils)
        PlanProcedures.setDirect(ils, "VEDEN")
        PlanProcedures.pick("KOSH", "approach", rnav)
        val s = PlanProcedures.state.value
        assertEquals(listOf(rnav), s.picks)
        assertTrue(s.direct.isEmpty())
        PlanProcedures.pick("KOSH", "approach", null)
        assertTrue(PlanProcedures.state.value.picks.isEmpty())
    }

    @Test
    fun theNavLogIsAskedForTheRoutesOwnFields() {
        PlanProcedures.pick("KATW", "departure", dep)
        PlanProcedures.pick("KOSH", "approach", ils)
        PlanProcedures.pick("KMSN", "approach", PlanProcedures.Pick("KMSN", "I36", "approach", "ILS RWY 36"))
        PlanProcedures.setDirect(ils, "VEDEN")
        PlanProcedures.setRunway("katw", "21", takeoff = true)
        PlanProcedures.setRunway("KOSH", "36", takeoff = false)
        PlanProcedures.setRunway("KMSN", "18", takeoff = false)
        PlanProcedures.setCrossing("veden", 3000)
        var written: List<EngineContract.ProceduresWriteInputPicksItem> = emptyList()
        val q = PlanProcedures.query(listOf("KATW", "KOSH")) { written = it; "text" }
        assertEquals(listOf("KATW", "KOSH"), written.map { it.ident })
        assertEquals("OSH", written.first().transition)
        assertEquals("VEDEN", written.last().direct)
        assertEquals("text", q["procedures"])
        assertEquals("KATW:21", q["runways"])
        assertEquals("KOSH:36", q["patterns"])
        assertEquals("VEDEN:3000", q["crossings"])
        assertEquals("true", q["wind_runways"])
    }

    @Test
    fun nothingPickedAsksOnlyForTheWindsRunways() {
        var asked = false
        val q = PlanProcedures.query(listOf("C81", "KDLH")) { asked = true; "x" }
        assertFalse(asked)
        assertNull(q["procedures"])
        assertNull(q["runways"])
        assertNull(q["patterns"])
        assertNull(q["crossings"])
        assertEquals("true", q["wind_runways"])
    }

    @Test
    fun aRunwayAndACrossingTakenOffAreTheWindsAndTheChartsAgain() {
        PlanProcedures.setRunway("KOSH", "36", takeoff = false)
        PlanProcedures.setRunway("KOSH", null, takeoff = false)
        PlanProcedures.setCrossing("VEDEN", 3000)
        PlanProcedures.setCrossing("VEDEN", null)
        val s = PlanProcedures.state.value
        assertTrue(s.landings.isEmpty() && s.crossings.isEmpty())
    }

    @Test
    fun aFieldsPicksComeInTheKindsOrder() {
        val arr = PlanProcedures.Pick("KOSH", "FOXHL3", "arrival", "FOXHL THREE")
        PlanProcedures.pick("KOSH", "approach", ils)
        PlanProcedures.pick("KOSH", "arrival", arr)
        assertEquals(listOf(arr, ils), PlanProcedures.at(PlanProcedures.state.value, "kosh", PlanProcedures.ARRIVING))
    }
}
