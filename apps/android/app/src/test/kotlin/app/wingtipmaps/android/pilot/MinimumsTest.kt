package app.wingtipmaps.android.pilot

import app.wingtipmaps.android.plan.FlightRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The personal minimums as the engine is asked them, each off until
 *  picked, and the flight rules' words as the planner reads them. */
class MinimumsTest {
    @Test
    fun eachMinimumIsItsOwnAndOffUntilPicked() {
        val m = Minimums().with(Minimums.Kind.CEILING, 1500.0).with(Minimums.Kind.VISIBILITY, 5.0)
        assertEquals(1500.0, m[Minimums.Kind.CEILING]!!, 0.0)
        assertNull(m[Minimums.Kind.CROSSWIND])
        val asked = m.forCopilot
        assertEquals(1500.0, asked.ceilingFt!!, 0.0)
        assertEquals(5.0, asked.visibilitySm!!, 0.0)
        assertNull(asked.windKt)
        // Put off again.
        assertNull(m.with(Minimums.Kind.CEILING, null).ceilingFt)
    }

    @Test
    fun theChoicesAreTheWebs() {
        // apps/web/src/lib/minimums.ts MINIMUM_CHOICES.
        assertEquals(listOf(3.0, 4.0, 5.0, 6.0, 8.0, 10.0), Minimums.CHOICES[Minimums.Kind.VISIBILITY])
        assertEquals(listOf(1000.0, 1500.0, 2000.0, 2500.0, 3000.0, 4000.0, 5000.0), Minimums.CHOICES[Minimums.Kind.CEILING])
    }

    @Test
    fun flightRulesAreVfrUntilSaidOtherwise() {
        assertEquals(FlightRules.VFR, FlightRules.of(null))
        assertEquals(FlightRules.IFR, FlightRules.of("ifr"))
        assertEquals("vfr", FlightRules.VFR.word)
    }
}
