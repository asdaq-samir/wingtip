package app.wingtipmaps.android.map.flow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The flow layer's pictures read as the weather service wrote them
 *  (services/weather/app/flow_grid.py png): the value in red between the
 *  field's least and most, the wind's east part in red and north in green,
 *  alpha 0 where the model gave none, north row first. */
class FlowGridTest {
    private fun pixel(red: Int, green: Int = red, alpha: Int = 255) = (alpha shl 24) or (red shl 16) or (green shl 8)

    /** A 2 by 2 picture over 0 to 2 E, 0 to 2 N: each pixel a degree. */
    private val bounds = listOf(0.0, 0.0, 2.0, 2.0)

    @Test
    fun aScalarIsItsRedBetweenTheLeastAndTheMost() {
        // The temperature's unscale, -75 to 52.5 C: 0 is -75, 255 is 52.5.
        val grid = FlowGrid.decode(intArrayOf(pixel(0), pixel(255), pixel(150), pixel(150)), 2, 2, bounds, listOf(-75.0, 52.5), vector = false)
        assertEquals(-75.0, grid.at(0, 0), 1e-4)
        assertEquals(52.5, grid.at(1, 0), 1e-4)
        // At the north-west pixel's own point (0.5 E, 1.5 N), its own value.
        assertEquals(-75.0, grid.valueAt(1.5, 0.5)!!.value, 1e-4)
    }

    @Test
    fun noneWhereAlphaIsZeroAndOffTheGrid() {
        val grid = FlowGrid.decode(intArrayOf(pixel(10, alpha = 0), pixel(10), pixel(10), pixel(10)), 2, 2, bounds, listOf(0.0, 255.0), vector = false)
        assertNull(grid.valueAt(1.5, 0.5))
        assertNull(grid.valueAt(3.0, 1.0))
        assertNull(grid.valueAt(1.0, -0.5))
    }

    @Test
    fun betweenFourPixelsTheValueIsBlended() {
        // Bilinear, as weatherlayers-gl reads with LINEAR: at the middle of
        // four points, their mean.
        val grid = FlowGrid.decode(intArrayOf(pixel(0), pixel(100), pixel(100), pixel(200)), 2, 2, bounds, listOf(0.0, 255.0), vector = false)
        assertEquals(100.0, grid.valueAt(1.0, 1.0)!!.value, 1e-3)
    }

    @Test
    fun theWindIsItsSpeedAndWhereItBlowsFrom() {
        // The wind's unscale, -100 to 100 kt: 128 is about 0.39 kt, so a
        // 20 kt east part is red 153 (20 + 100) / 200 * 255 = 153.
        val east = Math.round((20 + 100) / 200.0 * 255).toInt()
        val calm = Math.round(100 / 200.0 * 255).toInt()
        val p = pixel(east, calm)
        val grid = FlowGrid.decode(intArrayOf(p, p, p, p), 2, 2, bounds, listOf(-100.0, 100.0), vector = true)
        val read = grid.valueAt(1.0, 1.0)!!
        // Air carried east is a west wind: from 270 degrees.
        assertEquals(270.0, read.fromDeg!!, 1.0)
        assertEquals(20.0, read.value, 1.0)
    }
}
