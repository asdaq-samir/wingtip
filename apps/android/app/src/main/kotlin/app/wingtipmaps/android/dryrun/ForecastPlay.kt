package app.wingtipmaps.android.dryrun

import app.wingtipmaps.android.api.generated.ForecastRunAsk
import app.wingtipmaps.android.api.generated.RunAlert
import app.wingtipmaps.android.api.generated.RunArea
import app.wingtipmaps.android.api.generated.RunField
import app.wingtipmaps.android.api.generated.RunMinimums
import app.wingtipmaps.android.api.generated.RunPoint
import app.wingtipmaps.android.api.generated.RunSample
import app.wingtipmaps.android.pilot.Minimums
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import app.wingtipmaps.android.api.generated.ForecastRun as RunAnswer

/**
 * The dry run as the planner's forecast run takes it, and the answer read
 * at the run's time as it plays: the web's features/plan/forecastRun. The
 * rule is the engine's forecast_run, which the planner asks; nothing here
 * judges the weather, it only picks what the answer says for a time.
 */
object ForecastPlay {
    /** The most points sent: the planner takes up to 600, and every third
     *  of the run's two-mile points is a sample each six miles. */
    const val MOST_POINTS = 400

    /** The indexes kept of `n` points, evenly, at most MOST_POINTS of
     *  them -- MOST_POINTS and one at most, the last always kept. */
    fun thinned(n: Int): List<Int> {
        if (n <= 0) return emptyList()
        val every = maxOf(1, (n + MOST_POINTS - 1) / MOST_POINTS)
        return (0 until n).filter { it % every == 0 || it == n - 1 }
    }

    /**
     * The run as POST /api/forecast/run takes it: its points thinned, each
     * with the nav log's row it is flying to; the departure at the run's
     * start and each landing when the run is in there, the last the
     * destination; the flight rules ("vfr" or "ifr", the plan's) and the
     * pilot's ceiling and visibility minimums, null each where unset.
     */
    fun ask(path: DryRunPath, rules: String, minimums: Minimums): ForecastRunAsk {
        val points = path.points
        val track = thinned(points.size).map { i ->
            val p = points[i]
            RunPoint(altFt = if (path.heights) p.altFt else null, lat = p.lat, lon = p.lon, row = path.rowAt(p.t), t = p.t)
        }
        val course = path.course
        val places = (listOf(course.departure) + course.stops.orEmpty() + course.destination).associateBy { it.ident }
        val landings = path.answer.landings
        val fields = listOf(RunField(course.departure.ident, course.departure.lat, course.departure.lon, "departure", path.startT)) +
            landings.mapIndexedNotNull { i, l ->
                val at = places[l.ident] ?: return@mapIndexedNotNull null
                RunField(l.ident, at.lat, at.lon, if (i == landings.lastIndex) "destination" else "stop", l.t)
            }
        return ForecastRunAsk(
            fields = fields,
            minimums = RunMinimums(ceilingFt = minimums.ceilingFt, visibilitySm = minimums.visibilitySm),
            rules = if (rules.equals("ifr", ignoreCase = true)) "IFR" else "VFR",
            track = track,
        )
    }

    /** What the airplane meets at `t`: the sample it last passed, the
     *  first before the run reaches any. */
    fun sampleAt(answer: RunAnswer, t: Double): RunSample? =
        answer.samples.lastOrNull { it.t <= t } ?: answer.samples.firstOrNull()

    /** The alert the run reached last by `t`; none before the first. */
    fun alertAt(answer: RunAnswer, t: Double): RunAlert? = answer.alerts.lastOrNull { it.t <= t }

    /** The advisory areas in force at `t`, what the map draws as the run
     *  plays: from `valid_from` up to, not including, `valid_to`, an end
     *  not given open. */
    fun areasAt(answer: RunAnswer, t: Double): List<RunArea> =
        answer.areas.filter { (it.validFrom == null || it.validFrom <= t) && (it.validTo == null || t < it.validTo) }

    /** Where `t` is along the run, 0 at its first leg's start to 1 at its
     *  last leg's end, for the strip's marker. */
    fun fraction(answer: RunAnswer, t: Double): Float {
        val from = answer.legs.firstOrNull()?.fromT ?: return 0f
        val to = answer.legs.last().toT
        return if (to > from) ((t - from) / (to - from)).coerceIn(0.0, 1.0).toFloat() else 0f
    }

    private val HOUR_Z = DateTimeFormatter.ofPattern("HH'Z'").withZone(ZoneOffset.UTC)

    /** An hour as forecasts write it, UTC: "14Z". */
    fun hourZ(t: Double): String = HOUR_Z.format(Instant.ofEpochMilli((t * 1000).toLong()))

    private val PRODUCTS = mapOf(
        "tafs" to "TAFs",
        "airsigmets" to "SIGMETs",
        "gairmets" to "G-AIRMETs",
        "spc-outlook" to "the SPC outlook",
        "glmp-forecast" to "the modelled hours (Gridded LAMP)",
        "winds" to "the winds aloft",
    )

    /** The products the planner could not have, in a pilot's words; null
     *  with all of them in. */
    fun unavailableWords(names: List<String>): String? =
        if (names.isEmpty()) null else "Played without ${names.joinToString(", ") { PRODUCTS[it] ?: it }}."
}
