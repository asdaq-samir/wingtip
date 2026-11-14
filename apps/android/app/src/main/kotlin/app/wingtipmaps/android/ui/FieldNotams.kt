package app.wingtipmaps.android.ui

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.notamRead
import app.wingtipmaps.android.engine.generated.tfrRead
import app.wingtipmaps.android.ui.card.Status
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * A field's NOTAMs as its card says them, the web's fieldNotams and
 * notamTimes: each read by the engine for a pilot (`notam_read`: its
 * heading, what it is and its condition in our words, where on the field,
 * its window), a TFR by `tfr_read` from what tfr.faa.gov gives of it.
 * Nothing is judged here; this picks which of the engine's words stand on
 * which line, and lays the times out as ForeFlight's NOTAM list does.
 */
object FieldNotams {
    /** How many the card's NOTAMs show before the title opens the rest:
     *  the engine's first three (notams_ranked says its top three first). */
    const val FIRST = 3

    /** In force unless the planner says it is not yet (in_force false). */
    fun active(n: RankedNotam): Boolean = n.inForce != false

    /** Its badge: Active in force, Later where it starts after `nowMs`,
     *  else Cold (said "Inactive"), as the web's PlaceNotams. */
    fun status(n: RankedNotam, nowMs: Long): Status {
        if (active(n)) return Status.Active
        val starts = instantOf(n.starts)?.toEpochMilli()
        return if (starts != null && starts > nowMs) Status.Later else Status.Cold
    }

    fun isTfr(n: RankedNotam): Boolean = n.kind == TFR

    /** The field's idents as a NOTAM may write them ("OSH", "KOSH"). */
    fun identsOf(ident: String): List<String> {
        val bare = if (ident.length == 4 && ident.startsWith("K")) ident.drop(1) else ident
        return listOf(ident, bare, "K$bare").distinct()
    }

    /** The NOTAM read by the engine (notam_read); null where it fails, the
     *  NOTAM's words as sent standing in then. */
    fun read(n: RankedNotam, ident: String): EngineContract.NotamReadAnswer? =
        Engine.notamRead(n.raw, identsOf(ident)).getOrNull()

    /** A TFR read by the engine (tfr_read): its kind as a heading, its
     *  kind and rule, its levels and where it is from the field, its place. */
    fun readTfr(n: RankedNotam): EngineContract.TfrReadAnswer? {
        val t = n.tfr
        return Engine.tfrRead(
            kind = t?.kind, rule = t?.rule, title = t?.title,
            floorFt = t?.floorFt, floorRef = t?.floorRef, ceilingFt = t?.ceilingFt, ceilingRef = t?.ceilingRef,
            overField = t?.overField,
            field = t?.field?.let { EngineContract.TfrPoint(it.lat, it.lon) },
            edge = t?.edge?.let { EngineContract.TfrPoint(it.lat, it.lon) },
        ).getOrNull()
    }

    /** One NOTAM as the card says it: the engine's readings, once. */
    class Said(val notam: RankedNotam, val read: EngineContract.NotamReadAnswer?, val tfr: EngineContract.TfrReadAnswer?) {
        /** Its first line: what it is and its condition in our words, else
         *  its words written out; a TFR's kind and rule. */
        val what: String get() = (if (tfr != null) tfr.what else read?.what ?: read?.words) ?: notam.raw

        /** Where it is, only where that is not obvious: a NOTAM's place off
         *  the field, a TFR's levels and where it is from the field. */
        val where: String? get() = if (isTfr(notam)) tfr?.where else read?.where

        /** Its own page's heading, its kind ("Runway", "Security TFR"). */
        val heading: String? get() = if (isTfr(notam)) tfr?.heading else read?.heading

        /** Whether the engine had a what of ours, so its words are worth a line too. */
        val ours: Boolean get() = read?.what != null && !isTfr(notam)

        /** The group it is listed under when the list is open. */
        val kind: String? get() = if (isTfr(notam)) null else read?.heading
    }

    fun say(n: RankedNotam, ident: String): Said = Said(n, if (isTfr(n)) null else read(n, ident), if (isTfr(n)) readTfr(n) else null)

    /** Its number as a briefer reads it, the field's own name off it on the
     *  field's card ("11/060", not "ORD 11/060"); another place's kept. */
    fun number(n: RankedNotam, ident: String): String {
        val own = identsOf(ident).firstOrNull { n.id.startsWith("$it ") }
        return own?.let { n.id.drop(it.length + 1) } ?: n.id
    }

    /** The NOTAMs by what they are about, the engine's heading, each kind
     *  where its first NOTAM ranks; a TFR's under null (the card's "TFR"),
     *  one the engine could not head under "" (the card's "Other"). */
    fun kinds(said: List<Said>): List<Pair<String?, List<Said>>> =
        said.groupBy { if (isTfr(it.notam)) null else it.kind ?: "" }.toList()

    /** A feed's time, one with no zone read as UTC; null where it is none. */
    fun instantOf(iso: String?): Instant? {
        if (iso.isNullOrBlank()) return null
        return runCatching { Instant.parse(iso) }
            .recoverCatching { java.time.OffsetDateTime.parse(iso).toInstant() }
            .recoverCatching { Instant.parse(iso + "Z") }
            .getOrNull()
    }

    /** "11/10 06:00": month/day and the 24-hour clock in the device's own
     *  time, as a pilot writes it on a kneeboard, the zone not named (the
     *  owner, 2026-11-11: "No need to mention time zone, just say local"). */
    fun corner(at: Instant, zone: ZoneId = ZoneId.systemDefault()): String = CORNER.withZone(zone).format(at)

    /** How long, as ForeFlight writes it: "5m" under an hour, "5h05m"
     *  under a day, "4d16h" under ten, "18d" past them. */
    fun span(ms: Long): String {
        val minutes = maxOf(0L, Math.round(ms / 60_000.0))
        val d = minutes / 1440
        val h = minutes % 1440 / 60
        val m = minutes % 60
        return when {
            d >= 10 -> "${d}d"
            d >= 1 -> if (h > 0) "${d}d${h}h" else "${d}d"
            h > 0 -> String.format(Locale.US, "%dh%02dm", h, m)
            else -> "${m}m"
        }
    }

    /** One labelled line of a NOTAM's times. */
    enum class Label { SINCE, STARTS, ENDS, DURATION }

    /** A time line: its label, its time ("11/10 06:00") or how long,
     *  with "local" once, "(est.)", how soon ("in 18d"), or Permanent. */
    data class TimeLine(
        val label: Label,
        val value: String? = null,
        val local: Boolean = false,
        val estimated: Boolean = false,
        val soon: String? = null,
        val permanent: Boolean = false,
    )

    /**
     * A NOTAM's times on lines of their own, as ForeFlight's NOTAM list
     * gives them (the owner's screenshots, 2026-11-11): one in force
     * "Since" its start and "Ends" with how long is left; one to come
     * "Starts" with how soon, "Ends", and how long it lasts. An estimated
     * end "(est.)", PERM "Permanent" (JO 7930.2 4-2-1). The times are the
     * planner's, else the NOTAM's own as the engine reads them.
     */
    fun timeLines(n: RankedNotam, read: EngineContract.NotamReadAnswer?, now: Instant = AppClock.javaNow(), zone: ZoneId = ZoneId.systemDefault()): List<TimeLine> {
        val starts = instantOf(n.starts ?: read?.starts)
        val ends = instantOf(n.ends ?: read?.ends)
        val active = active(n)
        fun soon(at: Instant) = if (at.isAfter(now)) span(at.toEpochMilli() - now.toEpochMilli()) else null
        return buildList {
            if (starts != null) add(TimeLine(if (active) Label.SINCE else Label.STARTS, corner(starts, zone), local = ends == null, soon = if (active) null else soon(starts)))
            if (ends != null) {
                add(TimeLine(Label.ENDS, corner(ends, zone), local = true, estimated = read?.estimated == true, soon = soon(ends)))
            } else if (read?.permanent == true) {
                add(TimeLine(Label.ENDS, permanent = true))
            }
            if (!active && starts != null && ends != null) add(TimeLine(Label.DURATION, span(ends.toEpochMilli() - starts.toEpochMilli())))
        }
    }

    /** The words in red where they stand in a NOTAM's first line, and no
     *  other (the owner, 2026-11-11: "just the word closed and 'out of
     *  service' should be red and nothing else of the wording"). */
    val RED = Regex("""\bclosed\b|\bout of service\b""", RegexOption.IGNORE_CASE)

    private const val TFR = "tfr"
    private val CORNER = DateTimeFormatter.ofPattern("MM/dd HH:mm", Locale.US)
}
