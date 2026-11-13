package app.wingtipmaps.android.tiles

import org.maplibre.android.constants.GeometryConstants
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.sinh
import kotlin.math.tan

/**
 * The slippy-map tile a point lies in, on the Web Mercator grid every XYZ
 * server cuts its tiles on (the charts', the radar's), the one copy the
 * app has. MapLibre Native gives the other way round, a tile's bounds
 * (LatLngBounds.from(z, x, y)), but no tile for a point without a map on
 * screen; its own limits of the projection (GeometryConstants) are the
 * clamp, so a point past the poles' last row is in that row, as the map
 * draws it.
 */
object TileGrid {
    /** The column at zoom `z` of a longitude. */
    fun column(lon: Double, z: Int): Int {
        val n = 1 shl z
        return floor((lon + 180.0) / 360.0 * n).toInt().coerceIn(0, n - 1)
    }

    /** The row at zoom `z` of a latitude, north at 0. */
    fun row(lat: Double, z: Int): Int {
        val n = 1 shl z
        val r = Math.toRadians(lat.coerceIn(GeometryConstants.MIN_MERCATOR_LATITUDE, GeometryConstants.MAX_MERCATOR_LATITUDE))
        return floor((1.0 - ln(tan(r) + 1.0 / cos(r)) / PI) / 2.0 * n).toInt().coerceIn(0, n - 1)
    }

    /** Web Mercator's y of a latitude on the unit sphere, in radians. */
    fun mercatorY(lat: Double): Double = ln(tan(PI / 4 + Math.toRadians(lat) / 2))

    /** The latitude of a Web Mercator y on the unit sphere. */
    fun latitude(mercatorY: Double): Double = Math.toDegrees(atan(sinh(mercatorY)))
}
