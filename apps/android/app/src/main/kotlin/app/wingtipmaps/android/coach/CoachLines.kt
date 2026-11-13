package app.wingtipmaps.android.coach

import app.wingtipmaps.android.api.generated.CoachDue
import app.wingtipmaps.android.api.generated.CoachEvidence
import app.wingtipmaps.android.api.generated.CoachSession
import app.wingtipmaps.android.api.generated.CoachWeakArea
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The plan as the Coach writes it, as the web's CoachPage: only words
 * round the engine's own figures and dates -- the status, the days left,
 * the minutes and the place are each the plan's, never worked out here.
 */
object CoachLines {
    /** How a status reads, red, amber, green or grey as the web's finding
     *  tones. */
    enum class Tone { STOP, CAUTION, OK, UNKNOWN }

    private val DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)

    /** A day as the web's `said` writes one: "18 Nov 2026"; as given where
     *  it is not a date. */
    fun day(iso: String?): String = iso?.let { runCatching { LocalDate.parse(it).format(DAY) }.getOrDefault(it) } ?: ""

    /** A currency's status in words: "To 18 Nov 2026", "9 days left",
     *  "Lapsed", "From 1 Dec 2026", "Not on record". */
    fun status(d: CoachDue): String = when (d.status) {
        "current" -> "To ${day(d.until)}"
        "due_soon" -> if (d.daysLeft == 1) "1 day left" else "${d.daysLeft} days left"
        "lapsed" -> "Lapsed"
        "pending" -> "From ${day(d.from)}"
        else -> "Not on record"
    }

    fun tone(d: CoachDue): Tone = when (d.status) {
        "current" -> Tone.OK
        "due_soon", "pending" -> Tone.CAUTION
        "lapsed" -> Tone.STOP
        else -> Tone.UNKNOWN
    }

    /** A due row's line under its label: "14 CFR 61.57(b) · …". */
    fun dueDetail(d: CoachDue): String = "${d.rule} · ${d.detail}"

    /** Where, how long and with whom: "KMSN, ILS 18 · About 60 min · With
     *  an instructor". */
    fun session(s: CoachSession): String = listOfNotNull(
        s.place?.let { p -> listOfNotNull(p.ident, p.approach?.ifEmpty { null }).joinToString(", ") },
        "About ${s.minutes} min",
        "With an instructor".takeIf { s.instructor },
    ).joinToString(" · ")

    /** "May count toward WINGS: Area, ACS task", never that it does. */
    fun wings(s: CoachSession): String? = s.wings?.let { "May count toward WINGS: ${it.area}, ACS ${it.acs}" }

    /** A weak area's heading: "Stabilized approaches · 2 · ACS IR.VI.B". */
    fun weakTitle(w: CoachWeakArea): String =
        listOfNotNull(w.label, w.evidence.size.toString(), w.acs.takeIf { it.isNotEmpty() }?.let { "ACS ${it.joinToString(", ")}" }).joinToString(" · ")

    /** The evidence a weak area rests on, in the plan's order. */
    fun evidence(plan: ProficiencyPlan, w: CoachWeakArea): List<CoachEvidence> = plan.evidence.filter { it.id in w.evidence }

    /** One line of evidence: "2 Nov 2026 at KMSN, ILS Y RWY 08: …", the
     *  approach's procedure beside its field where the line is one's. */
    fun evidenceLine(e: CoachEvidence): String = "${day(e.flownOn)} at ${listOfNotNull(e.place, e.procedure).joinToString(", ")}: ${e.text}"
}
