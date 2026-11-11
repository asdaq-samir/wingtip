package app.wingtipmaps.android.flight

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.compassWord
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.format.Format

/**
 * Where a point goes among a route's stops, and a bearing written as a
 * compass point. The sphere's own figures -- distance, bearing, where a
 * course reaches -- are the engine's (`distance_nm`, `bearing_deg`,
 * `destination`), asked by name; no great-circle arithmetic lives here.
 */
object Geo {
    /** A distance between two points, nm: the engine's `distance_nm`; a
     *  test's own in its place. */
    fun interface Distance {
        fun nm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Result<Double>
    }

    val engineDistance = Distance { lat1, lon1, lat2, lon2 -> Engine.distanceNm(lat1, lon1, lat2, lon2) }

    /** Where a point goes into a route so it bends it least: the index of
     *  the leg (between points i and i + 1) whose detour through it is the
     *  shortest, which is the point's place among the stops (the web's
     *  lib/geo bestStopIndex). Geometry over the engine's distances, not a
     *  rule; a distance it could not give fails the whole (Engine.rule has
     *  logged why), so no place is guessed. */
    fun bestStopIndex(points: List<Pair<Double, Double>>, lat: Double, lon: Double, distance: Distance = engineDistance): Result<Int> = runCatching {
        fun nm(aLat: Double, aLon: Double, bLat: Double, bLon: Double) = distance.nm(aLat, aLon, bLat, bLon).getOrThrow()
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
        best
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
