package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.RankedNotam
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * What the airport card's alert card says, from the field's own NOTAMs
 * (/api/airport/{ident}/notams, the engine's notams_ranked): a NOTAM that
 * closes the field or one of its runways, and a TFR within 5 nm of it, as
 * the iPhone's AirportAlertCard picks them. Nothing is judged here: the
 * engine marks a NOTAM `closed` and the planner a TFR's `kind`; this only
 * keeps those, in the engine's order, at most three.
 */
object FieldAlerts {
    /** The most a card lists; the rest are a tap away in its NOTAMs. */
    const val MOST = 3

    /** The closures and TFRs, the engine's most important first. */
    fun of(ranked: NotamsRanked?): List<RankedNotam> =
        ranked?.notams.orEmpty().filter { it.closed || it.kind == TFR }.sortedBy { it.rank }.take(MOST)

    fun isTfr(notam: RankedNotam) = notam.kind == TFR

    /** The NOTAM's words without its "!BJC 10/060 BJC" head, which says
     *  only who sent it and its number; the whole text where that is all. */
    fun body(raw: String): String = HEAD.replace(raw, "").ifBlank { raw }

    /** When it is in force, for the line under it. */
    sealed interface When {
        /** In force now, until `ends` where it says when. */
        data class Now(val ends: String?) : When

        /** To come: from `starts`, until `ends` where it says when. */
        data class Coming(val starts: String, val ends: String?) : When
    }

    /** When it is in force, its times as "Nov 12 1432Z" (UTC, as NOTAMs
     *  are issued: AIM 5-1-3), the day kept since a closure can last days.
     *  Null where the feed gives no time to say. */
    fun whenOf(notam: RankedNotam): When? {
        val starts = notam.starts?.let(::zulu)
        val ends = notam.ends?.let(::zulu)
        return when {
            notam.inForce == true -> When.Now(ends)
            starts != null -> When.Coming(starts, ends)
            else -> null
        }
    }

    /** An ISO time from the feed, read as UTC where it names no zone. */
    fun zulu(iso: String): String? {
        val at = runCatching { Instant.parse(iso) }.recoverCatching { Instant.parse(iso + "Z") }.getOrNull() ?: return null
        return DAY_ZULU.format(at)
    }

    private const val TFR = "tfr"
    private val HEAD = Regex("""^!\S+\s+\S+\s+\S+\s+""")
    private val DAY_ZULU = DateTimeFormatter.ofPattern("MMM d HHmm'Z'", Locale.US).withZone(ZoneOffset.UTC)
}
