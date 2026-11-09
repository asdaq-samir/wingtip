package app.wingtipmaps.android.design

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Reduce Motion as Android sets it: the animator duration scale at 0
 *  ("Remove animations"); any other scale, slowed or sped, still moves. */
class MotionTest {
    @Test
    fun removeAnimationsIsReduceMotion() {
        assertTrue(reduceMotion(0f))
        assertFalse(reduceMotion(1f))
        assertFalse(reduceMotion(0.5f))
        assertFalse(reduceMotion(10f))
    }
}
