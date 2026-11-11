package app.wingtipmaps.android.api

import java.io.IOException
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Why a call to Wingtip's server failed, as one plain sentence for the
 * screen where it happened (the sheet audit's L-4, 2026-11-10: "failed to
 * connect to /10.0.2.2 (port 28443)…" reached the map, the airport card,
 * Settings and the welcome). The exception itself -- addresses, ports,
 * timeouts -- goes to the log only, for a developer, as the web app's
 * lib/problems keeps a fetch's details out of what it says. The log is
 * java.util.logging's, which Android writes to logcat under "Wingtip" and
 * a JVM unit test to its output, so a model's tests need no Android stub.
 */
object Problems {
    private val log = Logger.getLogger("Wingtip")

    /**
     * `what` failed, as "The chart could not be fetched", given why: the
     * sentence to show, the details logged.
     */
    fun say(what: String, e: Throwable): String {
        log.log(Level.WARNING, what, e)
        return words(what, e)
    }

    /**
     * The sentence alone, with nothing logged: no connection, the
     * server's own words where it refused the ask (a 4xx carries words
     * meant for the pilot, the gateway's ErrorResponse or FastAPI's
     * `detail`), and otherwise `what` and nothing more.
     */
    fun words(what: String, e: Throwable): String {
        val refused = when (e) {
            is Gateway.Refusal -> e.status to e.words
            is Planner.Failure -> e.status to e.detail
            else -> null
        }
        val said = refused?.takeIf { it.first in CLIENT_ERRORS }?.second?.trim()?.trimEnd('.')?.ifEmpty { null }
        return when {
            e is IOException -> "$what: there is no connection to Wingtip."
            said != null -> "$what: $said."
            else -> "$what."
        }
    }

    private val CLIENT_ERRORS = 400..499
}
