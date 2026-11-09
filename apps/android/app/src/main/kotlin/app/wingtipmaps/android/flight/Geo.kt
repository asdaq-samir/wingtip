package app.wingtipmaps.android.flight

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.compassWord
import app.wingtipmaps.android.format.Format
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * The two figures of the sphere the flight pieces need between fixes,
 * worked here rather than through the engine: a fix comes every second
 * (OwnShip), and a call into the engine per fix for one distance is
 * waste. The same great-circle arithmetic as the engine's geo and the
 * iOS app's OwnTrail.distanceNm; no rule lives here.
 */
object Geo {
    private const val RAD = Math.PI / 180
    /** The Earth's radius in nm (the FAA's 6,371 km, 3,440.065 nm). */
    private const val EARTH_NM = 3440.065

    /** Where a point goes into a route so it bends it least: the index of
     *  the leg (between points i and i + 1) whose detour through it is the
     *  shortest, which is the point's place among the stops (the web's
     *  lib/geo bestStopIndex). Geometry, not a rule. */
    fun bestStopIndex(points: List<Pair<Double, Double>>, lat: Double, lon: Double): Int {
        var best = 0
        var least = Double.POSITIVE_INFINITY
        for (i in 0 until points.size - 1) {
            val (aLat, aLon) = points[i]
            val (bLat, bLon) = points[i + 1]
            val added = nm(aLat, aLon, lat, lon) + nm(lat, lon, bLat, bLon) - nm(aLat, aLon, bLat, bLon)
            if (added < least) {
                best = i
                least = added
            }
        }
        return best
    }

    /** The great-circle distance between two points, nm. */
    fun nm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val la1 = lat1 * RAD
        val la2 = lat2 * RAD
        val dLon = (lon2 - lon1) * RAD
        val x = sin(la1) * sin(la2) + cos(la1) * cos(la2) * cos(dLon)
        return acos(x.coerceIn(-1.0, 1.0)) * EARTH_NM
    }

    /** The initial true bearing from one point to another, 0 to 360. */
    fun bearingDeg(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val la1 = lat1 * RAD
        val la2 = lat2 * RAD
        val dLon = (lon2 - lon1) * RAD
        val y = sin(dLon) * cos(la2)
        val x = cos(la1) * sin(la2) - sin(la1) * cos(la2) * cos(dLon)
        return ((atan2(y, x) / RAD) + 360) % 360
    }

    /** The point `nm` along a great circle from a point on a true
     *  bearing: where an airplane is, carried on along its track between
     *  reports (the web's lib/map/traffic carriedOn). */
    fun destination(lat: Double, lon: Double, bearingDeg: Double, nm: Double): Pair<Double, Double> {
        val d = nm / EARTH_NM
        val b = bearingDeg * RAD
        val la1 = lat * RAD
        val lo1 = lon * RAD
        val la2 = asin(sin(la1) * cos(d) + cos(la1) * sin(d) * cos(b))
        val lo2 = lo1 + atan2(sin(b) * sin(d) * cos(la1), cos(d) - sin(la1) * sin(la2))
        return la2 / RAD to ((lo2 / RAD + 540) % 360 - 180)
    }

    private val SHORT = mapOf(
        "north" to "N", "northeast" to "NE", "east" to "E", "southeast" to "SE",
        "south" to "S", "southwest" to "SW", "west" to "W", "northwest" to "NW",
    )

    /** The compass point of a bearing, "N", "NE" ... as the iOS app's
     *  AirportWords.compassPoint says where traffic is: the engine's
     *  `compass_word`, the web's and the iPhone's, written short. Once a
     *  notification, not a fix, so the call is no waste. */
    fun compassPoint(bearingDeg: Double): String {
        // Wording only: where the engine fails (Engine.rule logs it) the
        // bearing itself is said, "045°", which is still right.
        return Engine.compassWord(bearingDeg).map { SHORT[it] ?: it }
            .getOrElse { Format.heading(bearingDeg) }
    }
}
