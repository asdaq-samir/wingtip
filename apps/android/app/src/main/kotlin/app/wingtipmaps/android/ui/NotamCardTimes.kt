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
 * A NOTAM's times on its own card, a line each, as the web's notamTimes
 * cardTimes (the owner, 2026-11-23, of FDC 6/3373; rules.md 19): "In
 * effect since 05/27 13:43 CDT", or "Starts ... · in 5h45m"; its end
 * "Until ..." with how long is left, an EST end as its time alone (the
 * owner, 2026-11-23: "no need for the word estimated"). Where the engine's
 * notam_card says the condition runs until the charts show it
 * (`untilCharts`: PERM with an EST end or none, JO 7930.2 4-2-1), just
 * "Permanent" (the owner: "For a permanent, just say permanent"). The
 * year where either end is not this year's. In the field's own time with
 * its zone's short name (the planner's time_zone; the owner: "no need to
 * say the word local or Z time"), else "18:43 UTC", never the device's own
 * time called the field's. Each line keeps one line (the owner: "one line
 * each"): the card draws its fullest form that fits, a this year's date
 * losing its year first, then the time to go. Only the lines and their
 * times are laid out here; the words are the card's strings (NotamPage).
 */
object NotamCardTimes {
    enum class Kind { SINCE, STARTS, UNTIL, PERMANENT }

    /** One line: what it says, its time ("05/27/26 13:43 CDT"), the same
     *  without this year's year (`short`), and how soon ("5h45m"). */
    data class Line(val kind: Kind, val at: String? = null, val short: String? = null, val soon: String? = null)

    fun lines(
        n: RankedNotam,
        read: EngineContract.NotamReadAnswer?,
        untilCharts: Boolean,
        zone: String?,
        now: Instant = AppClock.javaNow(),
    ): List<Line> {
        val starts = FieldNotams.instantOf(n.starts ?: read?.starts)
        val ends = FieldNotams.instantOf(n.ends ?: read?.ends)
        val withYear = withYear(listOfNotNull(starts, ends), now)
        val field = zoneOf(zone)
        fun soon(at: Instant) = if (at.isAfter(now)) FieldNotams.span(at.toEpochMilli() - now.toEpochMilli()) else null
        fun line(kind: Kind, at: Instant, soon: String?) =
            Line(kind, whenOf(at, field, withYear), whenOf(at, field, withYear && !withYear(listOf(at), now)), soon)
        return buildList {
            if (starts != null) add(if (FieldNotams.active(n)) line(Kind.SINCE, starts, null) else line(Kind.STARTS, starts, soon(starts)))
            if (untilCharts) add(Line(Kind.PERMANENT))
            else if (ends != null) add(line(Kind.UNTIL, ends, soon(ends)))
        }
    }

    /** Whether a NOTAM's times say their year: where any is not this
     *  year's (the owner, 2026-11-23, FDC 6/3373's end two years on). */
    fun withYear(times: List<Instant>, now: Instant): Boolean {
        val year = now.atZone(ZoneOffset.UTC).year
        return times.any { it.atZone(ZoneOffset.UTC).year != year }
    }

    /** The planner's zone, null where it gives none or the JVM's zone data
     *  does not know it. */
    fun zoneOf(id: String?): ZoneId? = id?.takeIf { it.isNotBlank() }?.let { runCatching { ZoneId.of(it) }.getOrNull() }

    /** "05/27/26 13:43 CDT" in the field's zone, the year only where
     *  `year`; "05/27 18:43 UTC" where the zone is not known. `clock`
     *  false says the day alone. */
    fun whenOf(at: Instant, zone: ZoneId?, year: Boolean, clock: Boolean = true): String {
        val day = if (year) "MM/dd/yy" else "MM/dd"
        val pattern = when {
            !clock -> day
            zone != null -> "$day HH:mm z"
            else -> "$day HH:mm 'UTC'"
        }
        return DateTimeFormatter.ofPattern(pattern, Locale.US).withZone(zone ?: ZoneOffset.UTC).format(at)
    }
}
