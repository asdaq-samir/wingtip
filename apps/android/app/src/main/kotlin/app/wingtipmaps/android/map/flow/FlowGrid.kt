package app.wingtipmaps.android.map.flow

import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.sinh
import kotlin.math.tan

/**
 * One frame's picture of a field as values (the planner's
 * /api/weather/flow/{frame}/{field}.png, the weather service's
 * flow_grid.png): a latitude-longitude grid, north row first, over the
 * layer's `bounds` (west, south, east, north, the picture's edges, each
 * pixel drawn round its point); in each pixel the value in red scaled
 * between the field's `unscale` least and most (a 255th a step), the
 * wind's east part in red and its north part in green, and alpha 0 where
 * the model gave none. The web reads the same pictures through
 * weatherlayers-gl; this is that reading, pure, so it is tested without
 * a phone.
 */
class FlowGrid(
    val width: Int,
    val height: Int,
    val west: Double,
    val south: Double,
    val east: Double,
    val north: Double,
    val vector: Boolean,
    /** The value, or the wind's east part, by pixel, row by row; NaN for none. */
    private val a: FloatArray,
    /** The wind's north part; null for a scalar field. */
    private val b: FloatArray?,
) {
    /** A value read at a point: the value (the wind's speed), and for the
     *  wind the direction it blows from, degrees true. */
    data class Reading(val value: Double, val fromDeg: Double?)

    /** The value at a pixel, or the wind's speed; NaN for none. */
    fun at(col: Int, row: Int): Double {
        val i = row * width + col
        val u = a[i].toDouble()
        return if (b == null) u else hypot(u, b[i].toDouble())
    }

    /** The value at a point, read between the four pixels round it (bilinear,
     *  as weatherlayers-gl reads with LINEAR interpolation), the nearest one
     *  where a neighbour has none; null off the grid or where it has none. */
    fun valueAt(lat: Double, lon: Double): Reading? {
        if (lat !in south..north || lon !in west..east) return null
        val x = (lon - west) / (east - west) * width - 0.5
        val y = (north - lat) / (north - south) * height - 0.5
        val u = sample(a, x, y)
        if (u.isNaN()) return null
        if (b == null) return Reading(u, null)
        val v = sample(b, x, y)
        if (v.isNaN()) return null
        // The direction the wind blows from: the opposite of where its
        // east and north parts carry the air.
        val from = (Math.toDegrees(atan2(-u, -v)) + 360) % 360
        return Reading(hypot(u, v), from)
    }

    /** A channel read at fractional pixel (x, y), pixel centres at whole numbers. */
    private fun sample(c: FloatArray, x: Double, y: Double): Double {
        val x0 = floor(x).toInt().coerceIn(0, width - 1)
        val y0 = floor(y).toInt().coerceIn(0, height - 1)
        val x1 = (x0 + 1).coerceAtMost(width - 1)
        val y1 = (y0 + 1).coerceAtMost(height - 1)
        val fx = (x - x0).coerceIn(0.0, 1.0)
        val fy = (y - y0).coerceIn(0.0, 1.0)
        val p00 = c[y0 * width + x0]
        val p10 = c[y0 * width + x1]
        val p01 = c[y1 * width + x0]
        val p11 = c[y1 * width + x1]
        if (p00.isNaN() || p10.isNaN() || p01.isNaN() || p11.isNaN()) {
            val nx = if (fx < 0.5) x0 else x1
            val ny = if (fy < 0.5) y0 else y1
            return c[ny * width + nx].toDouble()
        }
        val top = p00 + (p10 - p00) * fx
        val bottom = p01 + (p11 - p01) * fx
        return top + (bottom - top) * fy
    }

    companion object {
        /**
         * A field's picture as values: `argb` the PNG's pixels as Android
         * hands them (Bitmap.getPixels, one ARGB int a pixel, decoded
         * without premultiplying), `bounds` the layer's [west, south, east,
         * north], `unscale` the field's [least, most].
         */
        fun decode(argb: IntArray, width: Int, height: Int, bounds: List<Double>, unscale: List<Double>, vector: Boolean): FlowGrid {
            require(argb.size == width * height) { "The picture is ${argb.size} pixels, not $width by $height." }
            val low = unscale[0]
            val step = (unscale[1] - low) / 255.0
            val a = FloatArray(argb.size)
            val b = if (vector) FloatArray(argb.size) else null
            for (i in argb.indices) {
                val p = argb[i]
                if ((p ushr 24) == 0) {
                    a[i] = Float.NaN
                    b?.set(i, Float.NaN)
                    continue
                }
                a[i] = (low + ((p shr 16) and 0xff) * step).toFloat()
                b?.set(i, (low + ((p shr 8) and 0xff) * step).toFloat())
            }
            return FlowGrid(width, height, bounds[0], bounds[1], bounds[2], bounds[3], vector, a, b)
        }

        /** Web Mercator's y of a latitude, radians (EPSG:3857 over the earth's radius). */
        fun mercY(lat: Double): Double = ln(tan(Math.PI / 4 + Math.toRadians(lat) / 2))

        /** The latitude of a Web Mercator y. */
        fun latOf(y: Double): Double = Math.toDegrees(atan(sinh(y)))
    }
}
