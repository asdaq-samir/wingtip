package app.wingtipmaps.android.search

import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.ui.card.Badged
import app.wingtipmaps.android.ui.card.Status

/**
 * How a list marks a field it offers, the web's marks: its use as the
 * planner or the engine named it ("private", "military", "joint"; NASR's
 * FACILITY_USE_CODE and OWNERSHIP_TYPE_CODE, never judged here) as its
 * badge (rules.md 9), and a
 * field NASR lists as closed never the one a list offers to fly to
 * (decision 0043). Pure, for a unit test.
 */
object FieldMarks {
    /** The badge for a field's use (rules.md 9); none for a public field. */
    fun useStatus(use: String?): Status? = when (use) {
        "private" -> Status.Private
        "military" -> Status.Military
        "joint" -> Status.Joint
        else -> null
    }

    /** A field's marks as the badges a row leads with: Closed with the
     *  planner's label (decision 0043), then its use with its own word. */
    fun badges(closed: String?, use: String?): List<Badged> =
        listOfNotNull(closed(closed)?.let { Badged(Status.Closed, it) }, useStatus(use)?.let { Badged(it) })

    /** A field's closed label as the planner sent it ("Closed
     *  indefinitely"), null for an open field (a blank one is none). */
    fun closed(label: String?): String? = label?.trim()?.ifEmpty { null }

    /** The first field or fix found that may be flown to: a closed field
     *  (the planner's `closed` label) is passed over, so Direct To is never
     *  offered to one. */
    fun firstOffered(fields: List<AirportSuggestion>, fixes: List<AirportSuggestion>): String? =
        (fields.filter { closed(it.closed) == null } + fixes).firstOrNull()?.ident
}
