package app.wingtipmaps.android.dryrun

import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.CourseEnd
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject

/**
 * The nav log's rows as the engine's dry_run reads them, laid out as the
 * web's navLogRows and the iPhone's DryRun.rows lay them out: the
 * departure, then each stop and the destination with the leg arriving
 * there; and where a climb tops out or a descent starts on a leg, a row of
 * its own before it, each row with the piece of the leg that arrives there
 * (`part`). The app asks the planner for no checkpoints, so a leg is a hop.
 */
object DryRunRows {
    /** The planner's own models written as the planner wrote them (snake
     *  case by @SerialName), a null left out, for the rows' open `leg`. */
    private val json = Json { explicitNulls = false }

    /** The rows for the legs the nav log has; null where they do not make
     *  one row a leg (a log still streaming in). */
    fun of(course: Course, legs: List<Leg>): List<EngineContract.NavLogRow>? {
        val ends = course.stops.orEmpty().map { "stop" to it } + ("destination" to course.destination)
        if (legs.isEmpty() || ends.size != legs.size) return null
        val rows = mutableListOf(EngineContract.NavLogRow(kind = "departure", airport = airport(course.departure)))
        for ((end, leg) in ends.zip(legs)) {
            val (turns, part) = arriving(leg)
            rows += turns
            rows += EngineContract.NavLogRow(kind = end.first, airport = airport(end.second), leg = map(leg), part = part?.let(::map))
        }
        return rows
    }

    /** Whether the rows carry the plan's climb (a top of climb), so the
     *  run's heights are the plan's profile; with none (a plan kept from
     *  before they were read) the height is left unknown, as iOS leaves it. */
    fun heights(rows: List<EngineContract.NavLogRow>): Boolean = rows.any { it.kind == "toc" }

    private fun airport(end: CourseEnd) =
        EngineContract.NavLogRowAirport(ident = end.ident, elevationFt = end.elevationFt, kind = end.kind, lat = end.lat, lon = end.lon)

    private fun map(leg: Leg): Map<String, JsonElement> = json.encodeToJsonElement(Leg.serializer(), leg).jsonObject

    /** Where a point on the leg is: miles along it, minutes and fuel so far. */
    private data class Along(val nm: Double, val min: Double?, val gal: Double?)

    /** A leg's tops of climb and descent as rows, in the order flown, each
     *  with the piece of the leg up to it -- up to a top of climb at the
     *  climb's own speeds -- and the piece that arrives at the row the leg
     *  ends at (navLogRows' arriving). None where the leg has neither. */
    internal fun arriving(leg: Leg): Pair<List<EngineContract.NavLogRow>, Leg?> {
        data class On(val kind: String, val point: EngineContract.NavLogRowPoint, val at: Along, val tasKt: Double?, val gsKt: Double?)
        val on = listOfNotNull(
            leg.toc?.let { t ->
                On("toc", EngineContract.NavLogRowPoint(lat = t.lat, lon = t.lon, alongNm = t.alongNm, altitudeFt = t.altitudeFt), Along(t.alongNm, t.eteMin, t.fuelGal), t.tasKt, t.groundspeedKt)
            },
            leg.tod?.let { t ->
                val point = EngineContract.NavLogRowPoint(lat = t.lat, lon = t.lon, alongNm = t.alongNm, altitudeFt = t.altitudeFt, toFt = t.toFt, pattern = t.pattern)
                On("tod", point, Along(t.alongNm, t.eteMin, t.fuelGal), null, null)
            },
        ).sortedBy { it.at.nm }
        if (on.isEmpty()) return emptyList<EngineContract.NavLogRow>() to null
        var from = Along(0.0, 0.0, 0.0)
        val turns = on.map { o ->
            var part = piece(leg, from, o.at)
            if (o.kind == "toc") part = part.copy(tasKt = o.tasKt ?: part.tasKt, groundspeedKt = o.gsKt)
            from = Along(o.at.nm, o.at.min, o.at.gal ?: 0.0)
            EngineContract.NavLogRow(kind = o.kind, point = o.point, leg = map(leg), part = map(part))
        }
        return turns to piece(leg, from, Along(leg.distanceNm, leg.eteMin, leg.fuelGal))
    }

    /** The piece of `leg` between two points on it: the miles, minutes and
     *  fuel between them, none where the end has none. */
    private fun piece(leg: Leg, from: Along, to: Along): Leg = leg.copy(
        distanceNm = maxOf(0.0, to.nm - from.nm),
        eteMin = to.min?.let { maxOf(0.0, it - (from.min ?: 0.0)) },
        fuelGal = to.gal?.let { maxOf(0.0, it - (from.gal ?: 0.0)) },
    )
}
