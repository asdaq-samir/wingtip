package app.wingtipmaps.android.map.flow

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import kotlin.math.roundToInt

/** A ramp's stop: a value in the field's unit and its colour, ARGB, its
 *  alpha how strongly it covers (the web's [value, [r, g, b, a]]). */
data class Stop(val at: Double, val argb: Int)

/**
 * A field's colour ramp, low to high (the web's FieldLook.ramp, which
 * weatherlayers-gl's palette draws): a value between two stops blended
 * between their colours, alpha too; under the first the first's colour
 * and over the last the last's, as a palette's domain clamps; no value,
 * clear.
 */
class Ramp(val stops: List<Stop>) {
    init {
        require(stops.isNotEmpty()) { "A ramp needs a stop." }
    }

    fun colour(value: Double): Int {
        if (value.isNaN()) return CLEAR
        if (value <= stops.first().at) return stops.first().argb
        if (value >= stops.last().at) return stops.last().argb
        val i = stops.indexOfFirst { it.at > value }
        val lo = stops[i - 1]
        val hi = stops[i]
        val t = (value - lo.at) / (hi.at - lo.at)
        return blend(lo.argb, hi.argb, t)
    }

    companion object {
        const val CLEAR = 0

        /** A colour token at an alpha in 255ths, the web's tone(): the
         *  token's own colour (WingtipColors), never its hex parsed again. */
        fun tone(colour: Color, alpha: Int): Int = (alpha.coerceIn(0, 255) shl 24) or (colour.toArgb() and 0xffffff)

        private fun blend(a: Int, b: Int, t: Double): Int {
            fun ch(shift: Int) = ((a ushr shift and 0xff) + ((b ushr shift and 0xff) - (a ushr shift and 0xff)) * t).roundToInt().coerceIn(0, 255)
            return (ch(24) shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
        }
    }
}

/**
 * A grid coloured into a picture MapLibre lays on the map. MapLibre
 * Native's image source stretches a picture between its four corners on
 * the Web Mercator plane, and has no raster-color to colour a value
 * picture on the GPU (13.7.1, docs/NATIVE-ANDROID.md); so each row of
 * the picture made here is a row of the Mercator plane, its latitude read
 * from the grid's equal-degree rows, and each pixel is the ramp's colour of
 * the grid's value there. ARGB, not premultiplied, as
 * Bitmap.createBitmap(IntArray, …) takes it.
 */
data class Painted(val pixels: IntArray, val width: Int, val height: Int, val west: Double, val south: Double, val east: Double, val north: Double) {
    override fun equals(other: Any?): Boolean = other is Painted && other.width == width && other.height == height && other.pixels.contentEquals(pixels)

    override fun hashCode(): Int = pixels.contentHashCode()

    companion object {
        /** The highest latitude painted: Web Mercator's own edge. */
        private const val MERCATOR_EDGE = 85.0511

        /** `grid` painted by `ramp`, as wide as the grid and as tall as the
         *  same span of Mercator at that width. */
        fun of(grid: FlowGrid, ramp: Ramp): Painted {
            val north = minOf(grid.north, MERCATOR_EDGE)
            val south = maxOf(grid.south, -MERCATOR_EDGE)
            val width = grid.width
            val xSpan = Math.toRadians(grid.east - grid.west)
            val yTop = FlowGrid.mercatorY(north)
            val yBottom = FlowGrid.mercatorY(south)
            val height = maxOf(1, (width * (yTop - yBottom) / xSpan).roundToInt())
            val out = IntArray(width * height)
            for (row in 0 until height) {
                val lat = FlowGrid.latOfMercatorY(yTop - (row + 0.5) / height * (yTop - yBottom))
                val gridRow = ((grid.north - lat) / (grid.north - grid.south) * grid.height).toInt().coerceIn(0, grid.height - 1)
                for (col in 0 until width) out[row * width + col] = ramp.colour(grid.at(col, gridRow))
            }
            return Painted(out, width, height, grid.west, south, grid.east, north)
        }
    }
}
