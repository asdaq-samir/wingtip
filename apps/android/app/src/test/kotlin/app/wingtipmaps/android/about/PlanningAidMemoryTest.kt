package app.wingtipmaps.android.about

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The planning-aid notice shows once: until accepted, then never again. */
class PlanningAidMemoryTest {
    @Test
    fun shownUntilAcceptedThenKept() {
        var kept = false
        val first = PlanningAidMemory(read = { kept }, write = { kept = it })
        assertFalse(first.accepted.value)
        first.accept()
        assertTrue(first.accepted.value)
        // The next launch reads it back.
        assertTrue(PlanningAidMemory(read = { kept }, write = { kept = it }).accepted.value)
    }
}
