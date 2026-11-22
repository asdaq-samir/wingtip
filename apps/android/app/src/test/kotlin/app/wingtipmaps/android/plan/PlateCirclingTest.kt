package app.wingtipmaps.android.plan

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** An approach's circling minimums as the planner placed its plate,
 *  asked once and kept by the pick's key, none where it has no plate:
 *  what the landing runway's rule reads (AIM 5-4-20). */
class PlateCirclingTest {
    @Test
    fun theFlagIsAskedOnceAndKeptByThePicksKey() = runTest {
        var asked = 0
        val circling = PlateCircling { _, _ -> asked++; true }
        assertEquals(true, circling.ask("kdlh", "I09"))
        assertEquals(true, circling.ask("KDLH", "I09"))
        assertEquals(1, asked)
        assertEquals(mapOf("KDLH:I09" to true), circling.known.value)
    }

    @Test
    fun noPlateOrNoAnswerIsNotKnown() = runTest {
        assertNull(PlateCircling { _, _ -> null }.ask("KDLH", "I09"))
        val failing = PlateCircling { _, _ -> throw java.io.IOException("offline") }
        assertNull(failing.ask("KDLH", "I09"))
        assertEquals(emptyMap<String, Boolean>(), failing.known.value)
    }
}
