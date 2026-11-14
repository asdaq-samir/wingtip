package app.wingtipmaps.android.map

import kotlin.math.cos
import kotlin.math.hypot

/**
 * Where a shelf's altitude tab may stand in 3D (the web's
 * airspaceShelves placesOn, 2026-11-14): up to LABEL_PLACES points spread
 * evenly along its outer ring by its length, LABEL_APART_KM apart at
 * least, from its point nearest the camera -- the southernmost, the
 * camera's side when the map faces north -- and then outward each way
 * round. MapLibre's collision keeps whichever fit, so a shelf crowded out
 * on its near side by the airports' marks shows its altitudes further
 * round, where one place left most shelves with none at a low tilt. Pure,
 * so it is tested without a map.
 */
object ShelfPlaces {
    /** About every 45 degrees round a ring, at most. */
    const val LABEL_PLACES = 8

    /** How far apart two places of one shelf are at least, km. */
    const val LABEL_APART_KM = 8.0

    /** Kilometres a degree of latitude, near enough to space labels a few
     *  kilometres apart on the plane near the ring (the web's KM_PER_DEG). */
    private const val KM_PER_DEG = 111.32

    private fun km(a: Pair<Double, Double>, b: Pair<Double, Double>, lat: Double): Double =
        hypot((a.first - b.first) * cos(Math.toRadians(lat)), a.second - b.second) * KM_PER_DEG

    /** The places on `ring` ([lon, lat] points, its last its first, as a
     *  GeoJSON ring's), the first the nearest the camera (rank 0). */
    fun on(ring: List<Pair<Double, Double>>): List<Pair<Double, Double>> {
        val n = ring.size
        if (n < 2) return ring.take(1)
        val lat = ring[0].second
        val start = ring.indices.minBy { ring[it].second }
        // The ring walked from the nearest point round to it again.
        val walk = ring.subList(start, n - 1) + ring.subList(0, start + 1)
        val along = DoubleArray(walk.size)
        for (i in 1 until walk.size) along[i] = along[i - 1] + km(walk[i - 1], walk[i], lat)
        val length = along.last()
        if (length <= 0) return listOf(walk[0])
        val count = (length / LABEL_APART_KM).toInt().coerceIn(1, LABEL_PLACES)
        fun at(d: Double): Pair<Double, Double> {
            var i = 1
            while (i < walk.size - 1 && along[i] < d) i++
            val (a, b) = walk[i - 1] to walk[i]
            val span = along[i] - along[i - 1]
            val t = if (span > 0) ((d - along[i - 1]) / span).coerceIn(0.0, 1.0) else 0.0
            return a.first + (b.first - a.first) * t to a.second + (b.second - a.second) * t
        }
        // Nearest first, then a step either way round: 0, 1, -1, 2, -2, ...
        return (0 until count).map { k ->
            val step = if (k % 2 == 1) (k + 1) / 2 else -k / 2
            at(((step * length / count) % length + length) % length)
        }
    }
}
