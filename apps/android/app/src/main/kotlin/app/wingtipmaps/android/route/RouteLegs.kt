package app.wingtipmaps.android.route

import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The course line cut into the route's legs, as the map draws and taps
 * them (the web's routeLegs, RouteGl): from each of the route's points to
 * the next, along the planner's great-circle line, so a tap on the line
 * says which leg it was and the selected one is cased in green. Pure, so
 * the cut is held on the JVM (RouteLegTest).
 */
object RouteLegs {
    /** The line's vertices for each leg, latitude first: the line cut at
     *  the vertex nearest each point in turn, never going back. A route
     *  with fewer than two points, or a line the points are not on, is one
     *  leg, the whole line. */
    fun cut(line: List<List<Double>>, points: List<RoutePoint>): List<List<List<Double>>> {
        val path = line.filter { it.size == 2 }
        if (path.size < 2) return emptyList()
        if (points.size < 2) return listOf(path)
        val at = IntArray(points.size)
        var from = 0
        for ((i, p) in points.withIndex()) {
            at[i] = when (i) {
                0 -> 0
                points.lastIndex -> path.lastIndex
                else -> nearest(path, p, from)
            }
            from = at[i]
        }
        return (0 until points.lastIndex).map { i -> path.subList(at[i], maxOf(at[i + 1], at[i] + 1).coerceAtMost(path.lastIndex) + 1) }
    }

    private fun nearest(path: List<List<Double>>, p: RoutePoint, from: Int): Int {
        var best = from
        var bestD = Double.MAX_VALUE
        for (k in from until path.size) {
            val dLat = path[k][0] - p.lat
            // Longitude's degrees shrink toward the poles.
            val dLon = (path[k][1] - p.lon) * kotlin.math.cos(Math.toRadians(p.lat))
            val d = dLat * dLat + dLon * dLon
            if (d < bestD) {
                bestD = d
                best = k
            }
        }
        return best
    }

    /** The legs as GeoJSON for the route's source: a line a leg, longitude
     *  first, each with its number in `leg`. */
    fun json(legs: List<List<List<Double>>>): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for ((i, leg) in legs.withIndex()) {
                if (leg.size < 2) continue
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") { put(LEG, i) }
                    putJsonObject("geometry") {
                        put("type", "LineString")
                        putJsonArray("coordinates") {
                            for (v in leg) addJsonArray {
                                add(v[1])
                                add(v[0])
                            }
                        }
                    }
                }
            }
        }
    }.toString()

    /** The property a leg's number is kept in. */
    const val LEG = "leg"
}
