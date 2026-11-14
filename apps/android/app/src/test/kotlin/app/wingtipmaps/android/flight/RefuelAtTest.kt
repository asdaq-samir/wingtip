package app.wingtipmaps.android.flight

import org.junit.Assert.assertEquals
import org.junit.Test

/** The fuel stops in_flight is told the tanks are filled at (the aviation
 *  audit's AV-4): the fields each of the planner's hops after the first
 *  begins at, found in order. */
class RefuelAtTest {
    @Test
    fun eachHopAfterTheFirstBeginsAtItsStop() {
        val fields = listOf("C81", "KMSN", "KOSH", "KGRB")
        assertEquals(listOf(1, 2), InFlight.refuelAt(fields, listOf("C81", "KMSN", "KOSH")))
    }

    @Test
    fun aRouteWithNoStopsRefuelsNowhereAndAFieldFlownTwiceIsFoundInOrder() {
        assertEquals(emptyList<Int>(), InFlight.refuelAt(listOf("C81", "KMSN"), listOf("C81")))
        assertEquals(listOf(1, 3), InFlight.refuelAt(listOf("C81", "KMSN", "KOSH", "KMSN", "C81"), listOf("C81", "KMSN", "KMSN")))
    }
}
