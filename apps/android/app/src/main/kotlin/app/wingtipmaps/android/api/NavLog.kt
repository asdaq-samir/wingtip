package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.NavLogAltitude
import app.wingtipmaps.android.api.generated.NavLogDone
import app.wingtipmaps.android.api.generated.NavLogStage
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString

/**
 * The nav log as the planner streams it (/api/navlog, newline-delimited
 * JSON, app.schemas.NavLogMessage): a "stage" line before each slow piece
 * of work, one "altitude" line once the altitudes are decided, one "leg"
 * line per leg, then "done" with the totals -- or "error" where no route
 * can be flown. Each line is one of the document's NavLogMessage kinds,
 * decoded into its generated model (NavLogStage, NavLogAltitude, Leg,
 * NavLogDone, NavLogError) by its "type".
 */
sealed interface NavLogMessage {
    data class Stage(val detail: String) : NavLogMessage

    /** The altitude flown; the four plans and the wheel's figures come
     *  with the altitude wheel, a later phase. */
    data class Altitude(val altitudeFt: Double?) : NavLogMessage

    data class OneLeg(val leg: Leg) : NavLogMessage

    data class Done(val totals: NavLogTotals) : NavLogMessage

    data class Problem(val error: NavLogError) : NavLogMessage
}

object NavLog {
    /** A line's kind, read before the line itself. */
    @Serializable
    private class Kind(val type: String)

    /** One line of the stream, or null for a line of a kind the app has
     *  no use for yet. */
    fun decode(line: String): NavLogMessage? {
        val json = Gateway.json
        return when (json.decodeFromString<Kind>(line).type) {
            "stage" -> NavLogMessage.Stage(json.decodeFromString<NavLogStage>(line).detail)
            "altitude" -> NavLogMessage.Altitude(json.decodeFromString<NavLogAltitude>(line).altitudeFt)
            "leg" -> NavLogMessage.OneLeg(json.decodeFromString<Leg>(line))
            "done" -> NavLogMessage.Done(json.decodeFromString<NavLogDone>(line).totals)
            "error" -> NavLogMessage.Problem(json.decodeFromString<NavLogError>(line))
            else -> null
        }
    }
}
