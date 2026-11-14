package app.wingtipmaps.android.search

import androidx.annotation.StringRes
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportSuggestion

/**
 * How a list marks a field it offers, the web's marks: its use as the
 * planner or the engine named it ("private", "military", "joint"; NASR's
 * FACILITY_USE_CODE and OWNERSHIP_TYPE_CODE, never judged here), and a
 * field NASR lists as closed never the one a list offers to fly to
 * (decision 0043). Pure, for a unit test.
 */
object FieldMarks {
    /** The mark for a field's use; none for a public field. */
    @StringRes
    fun use(use: String?): Int? = when (use) {
        "private" -> R.string.use_private
        "military" -> R.string.use_military
        "joint" -> R.string.use_joint
        else -> null
    }

    /** The first field or fix found that may be flown to: a closed field
     *  (the planner's `closed` label) is passed over, so Direct To is never
     *  offered to one. */
    fun firstOffered(fields: List<AirportSuggestion>, fixes: List<AirportSuggestion>): String? =
        (fields.filter { it.closed.isNullOrBlank() } + fixes).firstOrNull()?.ident
}
