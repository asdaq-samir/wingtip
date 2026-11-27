package app.wingtipmaps.android.ui

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A page full screen at night (a plate, an airport diagram): white on
 *  black where inverted and never brighter than the chart's Dimmer
 *  leaves it (AIM 8-1-6; the round-4 phones audit, 2026-11-27). */
class PageFilterTest {
    @Test
    fun thePageAsPrintedHasNoFilter() {
        assertNull(pageMatrix(inverted = false, brightness = 1f))
    }

    @Test
    fun invertedAtFullLightTurnsWhiteToBlack() {
        val m = pageMatrix(inverted = true, brightness = 1f)!!
        assertArrayEquals(floatArrayOf(-1f, 0f, 0f, 0f, 255f), m.sliceArray(0..4), 0f)
    }

    @Test
    fun theDimmerScalesThePagesLight() {
        // Half the light: the paper's white drawn at 127.5, inverted its ink.
        assertArrayEquals(floatArrayOf(0.5f, 0f, 0f, 0f, 0f), pageMatrix(false, 0.5f)!!.sliceArray(0..4), 0f)
        assertArrayEquals(floatArrayOf(-0.5f, 0f, 0f, 0f, 127.5f), pageMatrix(true, 0.5f)!!.sliceArray(0..4), 0f)
    }

    @Test
    fun alphaIsKept() {
        assertArrayEquals(floatArrayOf(0f, 0f, 0f, 1f, 0f), pageMatrix(true, 0.3f)!!.sliceArray(15..19), 0f)
    }
}
