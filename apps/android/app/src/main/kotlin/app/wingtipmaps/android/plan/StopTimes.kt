package app.wingtipmaps.android.plan

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * When the airplane is at each point of the route, as the web's FPL
 * timeline says it: the departure's time it leaves, each stop's when it
 * lands and when it leaves again (the planner's minutes on the ground
 * there, its `ground`, else its turnaround), the destination's when it
 * lands -- the plan's departure time plus the planner's minutes, never
 * worked out with no airplane (decision 0011). A time zone is said only
 * once a point keeps another one than the departure's, and then on every
 * point, each in its own (the owner, 2026-11-20: "When the time zone
 * changes then show it on all the stops"). Pure, for a unit test.
 */
object StopTimes {
    /** One leg as the walk needs it: where it ends, its minutes, and the
     *  minutes on the ground at its end where it ends at a stop. */
    data class LegTime(val to: String, val eteMin: Double?, val groundMin: Double?)

    /** At a point: when it lands there (none at the departure) and when
     *  it leaves (none at the destination). */
    data class At(val arriveMs: Long?, val leaveMs: Long?)

    /** Each point's times by its place: -1 the departure, a stop by its
     *  index, `stops.size` the destination; none past a leg with no time. */
    fun of(departMs: Long, legs: List<LegTime>, stops: List<String>): Map<Int, At> {
        val out = mutableMapOf(-1 to At(null, departMs))
        var t = departMs
        var next = 0
        for (leg in legs) {
            val ete = leg.eteMin ?: return out
            t += Math.round(ete * MS_PER_MIN)
            if (next < stops.size && stops[next].equals(leg.to, ignoreCase = true)) {
                val leave = t + Math.round((leg.groundMin ?: 0.0) * MS_PER_MIN)
                out[next] = At(t, leave)
                t = leave
                next++
            }
        }
        if (next == stops.size) out[stops.size] = At(t, null)
        return out
    }

    /** Whether any point keeps another zone than the departure's at its time. */
    fun zonesSaid(times: Map<Int, At>, zones: Map<Int, ZoneId?>, device: ZoneId = ZoneId.systemDefault()): Boolean {
        val dep = zones[-1] ?: device
        return times.any { (at, t) ->
            val ms = t.arriveMs ?: t.leaveMs ?: return@any false
            val instant = Instant.ofEpochMilli(ms)
            (zones[at] ?: device).rules.getOffset(instant) != dep.rules.getOffset(instant)
        }
    }

    /** A time as the timeline writes it: the bare clock, "14:10", where no
     *  zone is said; "13:00 MST" in the point's own zone where they are. */
    fun words(ms: Long, zone: ZoneId?, said: Boolean, device: ZoneId = ZoneId.systemDefault()): String {
        val pattern = if (said) "HH:mm zzz" else "HH:mm"
        return DateTimeFormatter.ofPattern(pattern, Locale.US).format(Instant.ofEpochMilli(ms).atZone(if (said) zone ?: device else device))
    }

    /** The minutes on the ground for a stop left again at the clock's
     *  `hour`:`minute` in `zone`: the next such time at or after landing,
     *  a day at most. */
    fun groundFor(arriveMs: Long, hour: Int, minute: Int, zone: ZoneId = ZoneId.systemDefault()): Int {
        val landed = Instant.ofEpochMilli(arriveMs).atZone(zone)
        var leave = landed.withHour(hour).withMinute(minute).withSecond(0).withNano(0)
        if (leave.isBefore(landed.withSecond(0).withNano(0))) leave = leave.plusDays(1)
        return ((leave.toInstant().toEpochMilli() - arriveMs) / MS_PER_MIN).toInt().coerceIn(0, MIN_PER_DAY)
    }

    private const val MS_PER_MIN = 60_000L
    private const val MIN_PER_DAY = 24 * 60
}
