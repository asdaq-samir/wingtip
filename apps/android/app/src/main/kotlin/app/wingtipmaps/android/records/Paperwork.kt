package app.wingtipmaps.android.records

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.DueDto
import app.wingtipmaps.android.api.generated.gateway.PaperworkDto
import java.util.Locale

/**
 * What falls due for the pilot and their airplanes, soonest first, each
 * with its rule and the days or hours left (GET /api/paperwork, the
 * gateway's PaperworkService): the days are the engine's or the owner's,
 * and only their words and tone are made here, as the web's lib/paperwork
 * and the iPhone's Due extension make them. The 30 days and 10 hours are
 * the reminders' window, not a rule's.
 */
object Paperwork {
    /** Within this many days, an item is coming up (the first reminder). */
    const val SOON_DAYS = 30L

    /** Within this many hours of time in service, an hour-counted item is. */
    const val SOON_HOURS = 10.0

    /** The list, or null signed out. */
    suspend fun fetch(): PaperworkDto? = Gateway.read("/api/paperwork")

    /** How near it is: past, within the window, further off, or not known. */
    enum class Tone { PAST, SOON, FINE, UNKNOWN }

    /** The airplane's tail before its own items. */
    fun named(due: DueDto): String = due.tailNumber?.let { "$it · ${due.title}" } ?: due.title

    /** "In 22 days", "Today", "3 days past"; by hours where it has no day. */
    fun whenWords(due: DueDto): String {
        val days = due.daysLeft
        if (days != null) {
            return when (days) {
                0L -> "Today"
                1L -> "Tomorrow"
                -1L -> "Yesterday"
                else -> if (days > 1) "In $days days" else "${-days} days past"
            }
        }
        val hours = due.hoursLeft
        if (hours != null) return if (hours > 0) "${tenths(hours)} h to go" else "Due now"
        return due.dueAtHours?.let { "At ${tenths(it)} h" } ?: ""
    }

    fun tone(due: DueDto): Tone {
        due.daysLeft?.let { return if (it < 0) Tone.PAST else if (it <= SOON_DAYS) Tone.SOON else Tone.FINE }
        due.hoursLeft?.let { return if (it <= 0) Tone.PAST else if (it <= SOON_HOURS) Tone.SOON else Tone.FINE }
        return Tone.UNKNOWN
    }

    /** The rule and the day, as the row's second line. */
    fun detail(due: DueDto): String = listOfNotNull(due.rule, due.dueOn).joinToString(" · ")

    private fun tenths(h: Double) = String.format(Locale.US, "%.1f", h)
}
