package app.wingtipmaps.android.map.flow

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The ramps colour a value as the web's palettes do, and a grid is
 *  painted onto the Web Mercator plane MapLibre's image source lays out. */
class FlowColourTest {
    private val ramp = Ramp(listOf(Stop(0.0, Ramp.tone(Color(0xFF000000), 0)), Stop(10.0, Ramp.tone(Color(0xFFFF0000), 255))))

    @Test
    fun aToneIsTheTokenAtItsAlpha() {
        assertEquals(0x80123456.toInt(), Ramp.tone(Color(0xFF123456), 128))
    }

    @Test
    fun aValueBetweenStopsIsBlendedAndOutsideThemClamped() {
        val mid = ramp.colour(5.0)
        assertEquals(128, mid ushr 24)
        assertEquals(128, (mid shr 16) and 0xff)
        assertEquals(Ramp.tone(Color(0xFFFF0000), 255), ramp.colour(99.0))
        assertEquals(Ramp.tone(Color(0xFF000000), 0), ramp.colour(-5.0))
        assertEquals(Ramp.CLEAR, ramp.colour(Double.NaN))
    }

    @Test
    fun theGridIsPaintedRowByRowOfMercator() {
        // A tall grid, 0 to 60 N: Mercator stretches the north, so the
        // picture is taller than its equal-degree rows, and its top row is
        // the grid's north row's value.
        val rows = 60
        val pixels = IntArray(rows) { r -> (255 shl 24) or (((rows - 1 - r) * 4) shl 16) }
        val grid = FlowGrid.decode(pixels, 1, rows, listOf(0.0, 0.0, 1.0, 60.0), listOf(0.0, 255.0), vector = false)
        val painted = Painted.of(grid, Ramp(listOf(Stop(0.0, Ramp.tone(Color(0xFF000000), 255)), Stop(255.0, Ramp.tone(Color(0xFFFF0000), 255)))))
        assertTrue(painted.height > rows)
        assertEquals(60.0, painted.north, 1e-9)
        val top = (painted.pixels.first() shr 16) and 0xff
        val bottom = (painted.pixels.last() shr 16) and 0xff
        assertEquals((rows - 1) * 4, top)
        assertEquals(0, bottom)
    }

    @Test
    fun noValueIsClear() {
        val grid = FlowGrid.decode(intArrayOf(0, 0, 0, 0), 2, 2, listOf(0.0, 0.0, 2.0, 2.0), listOf(0.0, 1.0), vector = false)
        val painted = Painted.of(grid, ramp)
        assertTrue(painted.pixels.all { it == Ramp.CLEAR })
    }
}
