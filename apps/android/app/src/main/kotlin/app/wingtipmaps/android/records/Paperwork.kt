package app.wingtipmaps.android.records

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.DueDto
import app.wingtipmaps.android.api.generated.gateway.PaperworkDto
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.dueTone
import java.util.Locale

/**
 * What falls due for the pilot and their airplanes, soonest first, each
 * with its rule and the days or hours left (GET /api/paperwork, the
 * gateway's PaperworkService): the days are the engine's or the owner's,
 * and so is the tone (`due_tone`); only their words are made here, as the
 * web's lib/paperwork and the iPhone's Due extension make them.
 */
object Paperwork {
    /** The list, or null signed out. */
    suspend fun fetch(): PaperworkDto? = Gateway.api.due().readOrNone()

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

    /** The engine's `due_tone` for the days or hours left; a test's own in
     *  its place. */
    fun interface ToneRule {
        fun tone(daysLeft: Double?, hoursLeft: Double?): Result<String>
    }

    val engineTone = ToneRule { days, hours -> Engine.dueTone(days, hours) }

    /** How near it falls due, the engine's `due_tone` (past, within the
     *  reminders' 30 days or 10 hours, further off); not known where the
     *  engine cannot say (Engine.rule has logged why). */
    fun tone(due: DueDto, rule: ToneRule = engineTone): Tone =
        when (rule.tone(due.daysLeft?.toDouble(), due.hoursLeft).getOrNull()) {
            "stop" -> Tone.PAST
            "caution" -> Tone.SOON
            "ok" -> Tone.FINE
            else -> Tone.UNKNOWN
        }

    /** The rule and the day, as the row's second line. */
    fun detail(due: DueDto): String = listOfNotNull(due.rule, due.dueOn).joinToString(" · ")

    private fun tenths(h: Double) = String.format(Locale.US, "%.1f", h)
}
