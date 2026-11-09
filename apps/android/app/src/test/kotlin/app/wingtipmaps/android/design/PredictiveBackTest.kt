package app.wingtipmaps.android.design

import org.junit.Assert.assertEquals
import org.junit.Test

/** The card under the back gesture: whole at the start, a tenth smaller
 *  at the full swipe, never past either end. */
class PredictiveBackTest {
    @Test
    fun shrinksByATenth() {
        assertEquals(1f, backScale(0f), 0f)
        assertEquals(0.95f, backScale(0.5f), 1e-6f)
        assertEquals(0.9f, backScale(1f), 1e-6f)
    }

    @Test
    fun heldWithinTheGesture() {
        assertEquals(1f, backScale(-0.2f), 0f)
        assertEquals(0.9f, backScale(1.4f), 1e-6f)
    }
}
