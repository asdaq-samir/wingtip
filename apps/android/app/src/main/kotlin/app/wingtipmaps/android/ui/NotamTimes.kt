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
 * A NOTAM's times, a line each, on its row and on its own card alike: the
 * web's one notamTimes timeLines (the owner, 2026-11-23, of FDC 6/3373;
 * rules.md 19). Only the lines and their times are laid out here; the
 * words are the strings (NotamLines).
 */
object NotamTimes {
    /** One labelled line of a NOTAM's times. */
    enum class Label { SINCE, STARTS, ENDS, DURATION }

    /** A time line: its label, its time ("11/10 06:00 CST") or how long,
     *  how soon ("18d"), which the line drops where it would not fit on one
     *  line, or Permanent. */
    data class TimeLine(
        val label: Label,
        val value: String? = null,
        val soon: String? = null,
        val permanent: Boolean = false,
    )

    /**
     * A NOTAM's times on lines of their own, as ForeFlight's NOTAM list
     * gives them (the owner's screenshots, 2026-11-11): one in force
     * "Since" its start and "Ends" with how long is left; one to come
     * "Starts" with how soon, "Ends", and how long it lasts. Each time in
     * the field's own zone with its short name, else UTC said so (whenOf;
     * the owner, 2026-11-23: "no need to say the word local or Z time"),
     * the year where either is not this year's; an EST end its time alone
     * (the owner: "no need for the word estimated"). Where the engine's
     * notam_card says it runs until the charts are updated (`untilCharts`:
     * PERM with an EST end or none, JO 7930.2 4-2-1), its end is
     * "Permanent" (the owner: "For a permanent, just say permanent"), as is
     * a PERM end. The times are the planner's, else the NOTAM's own as the
     * engine reads them.
     */
    fun timeLines(
        n: RankedNotam,
        read: EngineContract.NotamReadAnswer?,
        untilCharts: Boolean,
        zone: String?,
        now: Instant = AppClock.javaNow(),
    ): List<TimeLine> {
        val starts = FieldNotams.instantOf(n.starts ?: read?.starts)
        val ends = FieldNotams.instantOf(n.ends ?: read?.ends)
        val active = FieldNotams.active(n)
        val field = zoneOf(zone)
        // The year counted over the times shown: an end said "Permanent" does not put a year on its start.
        val year = withYear(listOfNotNull(starts, ends.takeUnless { untilCharts }), now, field)
        fun at(t: Instant) = whenOf(t, field, year)
        fun soon(at: Instant) = if (at.isAfter(now)) FieldNotams.span(at.toEpochMilli() - now.toEpochMilli()) else null
        return buildList {
            if (starts != null) add(TimeLine(if (active) Label.SINCE else Label.STARTS, at(starts), soon = if (active) null else soon(starts)))
            if (untilCharts || (ends == null && read?.permanent == true)) {
                add(TimeLine(Label.ENDS, permanent = true))
            } else if (ends != null) {
                add(TimeLine(Label.ENDS, at(ends), soon = soon(ends)))
            }
            if (!active && !untilCharts && starts != null && ends != null) {
                add(TimeLine(Label.DURATION, FieldNotams.span(ends.toEpochMilli() - starts.toEpochMilli())))
            }
        }
    }

    /** Whether a NOTAM's times say their year: where any is not this
     *  year's (the owner, 2026-11-23, FDC 6/3373's end two years on), the
     *  years counted in the zone they are shown in (`zone`, else UTC), so a
     *  date near New Year never lacks the year it needs. */
    fun withYear(times: List<Instant>, now: Instant, zone: ZoneId? = null): Boolean {
        val shown = zone ?: ZoneOffset.UTC
        val year = now.atZone(shown).year
        return times.any { it.atZone(shown).year != year }
    }

    /** The planner's zone, null where it gives none or the JVM's zone data
     *  does not know it. */
    fun zoneOf(id: String?): ZoneId? = id?.takeIf { it.isNotBlank() }?.let { runCatching { ZoneId.of(it) }.getOrNull() }

    /** "05/27/26 13:43 CDT" in the field's zone, the year only where
     *  `year`; "05/27 18:43 UTC" where the zone is not known, never the
     *  device's own time called the field's. `clock` false says the day
     *  alone. */
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
