package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.flowCell
import app.wingtipmaps.android.engine.generated.flowSample
import kotlin.math.atan
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.sinh
import kotlin.math.tan

/**
 * One frame's picture of a field (the planner's
 * /api/weather/flow/{frame}/{field}.png, the weather service's
 * flow_grid.png): a latitude-longitude grid, north row first, over the
 * layer's `bounds` (west, south, east, north, the picture's pixels' outer
 * edges); in each pixel the value in red scaled between the field's
 * `unscale` least and most (a 255th a step), the wind's east part in red
 * and its north part in green, and alpha 0 where the model gave none.
 *
 * The value where the pilot tapped is the engine's (`flow_cell` finds
 * the four pixels round the point, `flow_sample` reads between them), so
 * the web, the iPhone and this app read the same wind at the same point.
 * Each pixel's own value (at) is only for painting the picture, a pixel
 * a colour, where an engine call a pixel would be too slow.
 */
class FlowGrid(
    val width: Int,
    val height: Int,
    val west: Double,
    val south: Double,
    val east: Double,
    val north: Double,
    val vector: Boolean,
    /** The picture's pixels, ARGB, row by row from the north. */
    private val argb: IntArray,
    /** The field's [least, most]. */
    private val unscale: List<Double>,
    /** The ceiling's picture, which the engine reads rounded to its step,
     *  its top no ceiling (flow_sample's no_ceiling). */
    private val ceiling: Boolean = false,
) {
    init {
        require(argb.size == width * height) { "The picture is ${argb.size} pixels, not $width by $height." }
    }

    /** The two rules a reading asks, the engine's unless a test gives its own. */
    interface Rules {
        fun cell(input: EngineContract.FlowCellInput): Result<EngineContract.FlowCellAnswer?>

        fun sample(input: EngineContract.FlowSampleInput): Result<EngineContract.FlowSampleAnswer?>
    }

    /** The engine through the JNI shim (Engine.rule logs a failure). */
    object EngineRules : Rules {
        override fun cell(input: EngineContract.FlowCellInput) = Engine.flowCell(input.bounds, input.width, input.height, input.lat, input.lon)

        override fun sample(input: EngineContract.FlowSampleInput) = Engine.flowSample(input.pixels, input.fx, input.fy, input.unscale, input.vector, input.ceiling)
    }

    private val low = unscale[0]
    private val step = (unscale[1] - low) / 255.0

    /** The value at a pixel, or the wind's speed; NaN for none. */
    fun at(col: Int, row: Int): Double {
        val p = argb[row * width + col]
        if ((p ushr 24) == 0) return Double.NaN
        val u = low + ((p shr 16) and 0xff) * step
        return if (vector) hypot(u, low + ((p shr 8) and 0xff) * step) else u
    }

    /** A pixel's [red, green, alpha] bytes, as flow_sample takes them. */
    private fun bytes(i: Int): List<Double> {
        val p = argb[i]
        return listOf(((p shr 16) and 0xff).toDouble(), ((p shr 8) and 0xff).toDouble(), (p ushr 24).toDouble())
    }

    /** The value at a point (the wind's speed and where it blows from,
     *  degrees true, null for a calm); null off the picture or where it
     *  has none; a failure where a rule failed, which is no reading,
     *  never none. */
    fun valueAt(lat: Double, lon: Double, rules: Rules = EngineRules): Result<EngineContract.FlowSampleAnswer?> =
        rules.cell(EngineContract.FlowCellInput(listOf(west, south, east, north), width, height, lat, lon)).mapCatching { cell ->
            cell?.let { rules.sample(EngineContract.FlowSampleInput(it.pixels.map(::bytes), it.fx, it.fy, unscale, vector, ceiling)).getOrThrow() }
        }

    companion object {
        /** Web Mercator's y of a latitude, radians (EPSG:3857 over the
         *  earth's radius), for painting the grid's rows onto the plane
         *  MapLibre stretches a picture over (Painted). The app's one
         *  tile-maths home is still owed (map-maths.yml's phones rule). */
        fun mercatorY(lat: Double): Double = ln(tan(Math.PI / 4 + Math.toRadians(lat) / 2))

        /** The latitude of a Web Mercator y. */
        fun latOfMercatorY(y: Double): Double = Math.toDegrees(atan(sinh(y)))

        /**
         * A field's picture: `argb` the PNG's pixels as Android hands them
         * (Bitmap.getPixels, one ARGB int a pixel, decoded without
         * premultiplying), `bounds` the layer's [west, south, east, north],
         * `unscale` the field's [least, most], `ceiling` whether it is the
         * ceiling's.
         */
        fun decode(argb: IntArray, width: Int, height: Int, bounds: List<Double>, unscale: List<Double>, vector: Boolean, ceiling: Boolean = false): FlowGrid =
            FlowGrid(width, height, bounds[0], bounds[1], bounds[2], bounds[3], vector, argb, unscale, ceiling)
    }
}
