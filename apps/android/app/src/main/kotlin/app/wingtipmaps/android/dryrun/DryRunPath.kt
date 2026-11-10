package app.wingtipmaps.android.dryrun

import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip

/**
 * The flight flown on paper, the engine's dry_run answer, and where the
 * airplane is on it at a time: between the run's reports either side, its
 * height in proportion, its track and speed the earlier report's, as the
 * web's Replay.position and the iPhone's work it out each frame. A
 * rehearsal of the plan, not a fix.
 *
 * @param course the route it was flown on, for its fields' places.
 * @param heights whether the run's heights are the plan's (DryRunRows.heights).
 */
data class DryRunPath(val answer: EngineContract.DryRunAnswer, val course: Course, val heights: Boolean) {
    val points: List<EngineContract.DryRunAnswerPointsItem> get() = answer.points

    /** When the run starts and ends, s since 1970. */
    val startT: Double get() = points.firstOrNull()?.t ?: 0.0
    val endT: Double get() = points.lastOrNull()?.t ?: 0.0
    val totalS: Double get() = endT - startT

    /** The airplane at `t`, s since 1970, as the map draws own ship;
     *  null outside the run. */
    fun fixAt(t: Double): OwnShip.Fix? {
        if (points.size < 2 || t < startT || t > endT) return null
        var lo = 0
        var hi = points.lastIndex
        while (hi - lo > 1) {
            val mid = (lo + hi) / 2
            if (points[mid].t <= t) lo = mid else hi = mid
        }
        val a = points[lo]
        val b = points[hi]
        val f = if (b.t > a.t) (t - a.t) / (b.t - a.t) else 0.0
        val alt = if (!heights) null else if (a.altFt != null && b.altFt != null) a.altFt + (b.altFt - a.altFt) * f else a.altFt
        return OwnShip.Fix(
            lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f, altitudeFt = alt,
            trackDeg = a.trackDeg, groundspeedKt = a.gsKt, accuracyM = 0.0, atMs = (t * 1000).toLong(),
        )
    }

    /** The nav log's row the run is flying to at `t`: the first it has not
     *  reached yet, the departure's before it starts and the last once it
     *  is in (the web's dryRunRow). */
    fun rowAt(t: Double): Int {
        val rowT = answer.rowT
        if (rowT.isEmpty()) return 0
        val next = rowT.indexOfFirst { it >= t }
        return if (next < 0) rowT.lastIndex else next
    }
}
