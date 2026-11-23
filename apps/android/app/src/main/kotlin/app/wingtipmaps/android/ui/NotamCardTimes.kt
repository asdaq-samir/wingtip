package app.wingtipmaps.android.ui

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.generated.EngineContract
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A NOTAM's times on its own card, in words, as the web's notamTimes
 * cardTimes (the owner, 2026-11-23, of FDC 6/3373; rules.md 19): "In
 * effect since 27 May 2026, 13:43 CDT", or "Starts ... · in 5h45m"; its
 * end "Until ...", estimated where EST says so (JO 7930.2 4-2-1), with
 * how long is left. A permanent condition (the engine's notam_card: PERM,
 * or PERMANENTLY in its words) stays until the charts show it, its EST
 * end the estimate of when: "Until charts are updated (est. 27 May
 * 2028)". The year where either end is not this year's. In the field's
 * own time with its zone's short name (the planner's time_zone), else
 * UTC ("1843Z"), never the device's own time called the field's. Only
 * the lines and their times are laid out here; the words are the card's
 * strings (NotamPage).
 */
object NotamCardTimes {
    enum class Kind { SINCE, STARTS, UNTIL, UNTIL_CHARTS }

    /** One line: what it says, its time (none for "Until charts are
     *  updated" with no estimate), "estimated", and how soon. */
    data class Line(val kind: Kind, val at: String? = null, val estimated: Boolean = false, val soon: String? = null)

    fun lines(
        n: RankedNotam,
        read: EngineContract.NotamReadAnswer?,
        permanent: Boolean,
        zone: String?,
        now: Instant = AppClock.javaNow(),
    ): List<Line> {
        val starts = FieldNotams.instantOf(n.starts ?: read?.starts)
        val ends = FieldNotams.instantOf(n.ends ?: read?.ends)
        val year = now.atZone(ZoneOffset.UTC).year
        val withYear = listOfNotNull(starts, ends).any { it.atZone(ZoneOffset.UTC).year != year }
        val field = zoneOf(zone)
        val estimated = read?.estimated == true
        fun soon(at: Instant) = if (at.isAfter(now)) FieldNotams.span(at.toEpochMilli() - now.toEpochMilli()) else null
        return buildList {
            if (starts != null) {
                add(
                    if (FieldNotams.active(n)) Line(Kind.SINCE, whenOf(starts, field, withYear))
                    else Line(Kind.STARTS, whenOf(starts, field, withYear), soon = soon(starts)),
                )
            }
            if (permanent && (estimated || ends == null)) {
                add(Line(Kind.UNTIL_CHARTS, ends?.let { whenOf(it, field, withYear, clock = false) }))
            } else if (ends != null) {
                add(Line(Kind.UNTIL, whenOf(ends, field, withYear), estimated = estimated, soon = soon(ends)))
            }
        }
    }

    /** The planner's zone, null where it gives none or the JVM's zone data
     *  does not know it. */
    fun zoneOf(id: String?): ZoneId? = id?.takeIf { it.isNotBlank() }?.let { runCatching { ZoneId.of(it) }.getOrNull() }

    /** "27 May 2026, 13:43 CDT" in the field's zone, the year only where
     *  `year`; in UTC "27 May 2026, 1843Z" where the zone is not known.
     *  `clock` false says the day alone. */
    fun whenOf(at: Instant, zone: ZoneId?, year: Boolean, clock: Boolean = true): String {
        val day = if (year) "d MMM yyyy" else "d MMM"
        val pattern = when {
            !clock -> day
            zone != null -> "$day, HH:mm z"
            else -> "$day, HHmm'Z'"
        }
        return DateTimeFormatter.ofPattern(pattern, Locale.US).withZone(zone ?: ZoneOffset.UTC).format(at)
    }
}
