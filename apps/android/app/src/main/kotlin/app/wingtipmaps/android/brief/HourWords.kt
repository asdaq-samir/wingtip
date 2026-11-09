package app.wingtipmaps.android.brief

import app.wingtipmaps.android.api.generated.Window
import app.wingtipmaps.android.api.generated.WindowHour
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.strip.Finding
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/**
 * How "When should I go?" writes its hours, as the web's hourWords: each
 * hour's clock time on the phone's own clock with its zone, the best
 * window in a line, an hour's verdict as the Brief's finding marks draw
 * it, and its time and fuel -- or, with no airplane, that they need one.
 * The verdicts are the engine's departure_window; only the words are here.
 */
object HourWords {
    /** An hour's verdict as the finding its mark is drawn with. */
    fun finding(verdict: String): Finding = when (verdict) {
        "go" -> Finding.OK
        "caution" -> Finding.CAUTION
        "no-go" -> Finding.STOP
        else -> Finding.UNKNOWN
    }

    fun word(verdict: String): String = when (verdict) {
        "go" -> "Go"
        "caution" -> "Caution"
        "no-go" -> "No-go"
        else -> "Not known"
    }

    /** An instant's clock time, "07:00". */
    fun clock(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern("HH:mm", Locale.US).format(Instant.parse(iso).atZone(zone))

    /** The zone a time is written in, "CST". */
    fun zoneName(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern("zzz", Locale.US).format(Instant.parse(iso).atZone(zone))

    /** The weekday an hour falls on where it is not today's, "Tue". */
    fun dayOf(iso: String, now: Instant, zone: ZoneId = ZoneId.systemDefault()): String? {
        val at = Instant.parse(iso).atZone(zone)
        return if (at.toLocalDate() == now.atZone(zone).toLocalDate()) null else at.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.US)
    }

    /** "Best: 07:00–10:00 CST"; one hour alone, "Best: 07:00 CST"; a day
     *  not today named, "Best: Tue 07:00–10:00 CST". */
    fun bestLine(w: Window, now: Instant, zone: ZoneId = ZoneId.systemDefault()): String {
        val day = dayOf(w.start, now, zone)
        val span = if (w.hours > 1) "${clock(w.start, zone)}–${clock(w.last, zone)}" else clock(w.start, zone)
        return "Best: ${day?.let { "$it " }.orEmpty()}$span ${zoneName(w.start, zone)}".trimEnd()
    }

    /** "ETE 58m · 11.6 gal"; with no airplane, that they need one (the
     *  owner, 2026-11-08: "don't assume"). */
    fun hourFigures(h: WindowHour, airplane: Boolean): String {
        if (!airplane) return "ETE and fuel need an airplane"
        return listOfNotNull(h.eteMin?.let { "ETE ${Format.duration(it)}" }, h.fuelGal?.let(Format::fuel))
            .joinToString(" · ").ifEmpty { "No time or fuel worked out" }
    }

    /** An hour as TalkBack says it: its time, its verdict and why. */
    fun hourLabel(h: WindowHour, zone: ZoneId = ZoneId.systemDefault()): String {
        val why = h.reasons.firstOrNull()?.detail
        return "${clock(h.depart, zone)}: ${word(h.verdict)}${if (h.night) ", at night" else ""}${why?.let { ". $it" }.orEmpty()}"
    }

    /** At night (14 CFR 1.1), and with passengers 61.57(b)'s currency. */
    fun nightLine(h: WindowHour): String? = if (!h.night) null else "At night (14 CFR 1.1)" +
        if (h.nightPassengers) "; with passengers, three full-stop landings in the last 90 days in 61.57(b)'s night period" else ""
}
