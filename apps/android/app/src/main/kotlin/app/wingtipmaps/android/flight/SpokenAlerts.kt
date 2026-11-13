package app.wingtipmaps.android.flight

import android.content.Context
import android.speech.tts.TextToSpeech
import androidx.datastore.preferences.core.booleanPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.api.AheadAlert
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The alerts ahead said aloud, at the pilot's ask (Setup's switch), as the
 * iOS app's SpokenAlerts and the web app's lib/map/speak say them: the
 * pilot's eyes are outside, and a phone on a kneeboard is not looked at in
 * time (#218). Each is said once, as it first comes ahead -- the soonest
 * first, the rest as a count -- and again only after it has gone from
 * ahead and comes back. The words are the planner's, as a voice reads
 * them, through Android's own TextToSpeech.
 */
class SpokenAlerts(context: Context) {
    private val prefs = Kept.of(context, "spoken-alerts")
    private val _on = MutableStateFlow(prefs[KEY] ?: false)
    val on: StateFlow<Boolean> = _on.asStateFlow()
    private var said: Set<String> = emptySet()
    private var ready = false
    private val voice: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
    }

    fun setOn(on: Boolean) {
        prefs.edit { it[KEY] = on }
        _on.value = on
        // Turned on in the air, what is ahead then is said at once.
        if (on) said = emptySet()
    }

    /** Each answer of what is ahead. */
    fun hear(alerts: List<AheadAlert>) {
        if (!_on.value) return
        val (words, kept) = toSay(alerts, said)
        said = kept
        if (words != null && ready) {
            voice.language = Locale.US
            voice.speak(words, TextToSpeech.QUEUE_ADD, null, words.hashCode().toString())
        }
    }

    companion object {
        private val KEY = booleanPreferencesKey("on")

        /** When: "inside", "now", "in 40 seconds", "in 3 minutes" (the web
         *  app's alertWhen, as said). */
        fun whenSaid(alert: AheadAlert): String = when {
            alert.inside == true -> "inside"
            alert.seconds < 10 -> "now"
            alert.seconds < 60 -> "in ${(alert.seconds / 5).roundToInt() * 5} seconds"
            else -> (alert.seconds / 60).roundToInt().let { if (it == 1) "in 1 minute" else "in $it minutes" }
        }

        /** An alert's line, as said: "Chicago Class B, in 2 minutes"; the
         *  ground's or an obstacle's height against the airplane's, "300
         *  feet below you", where the planner gives it. */
        fun line(alert: AheadAlert): String {
            val title = if (alert.kind == "tfr") "TFR" else alert.name.replace(Regex("""(\d) ft\b"""), "$1 feet")
            val clearance = alert.clearanceFt?.let {
                String.format(Locale.US, "%,d feet %s you", abs(it).roundToInt(), if (it >= 0) "below" else "above")
            }
            return listOfNotNull(title, clearance, whenSaid(alert)).joinToString(", ")
        }

        /** What to say of the alerts ahead now, and the ids then said: each
         *  not said before, the first in full and the rest as a count; those
         *  gone from ahead forgotten, so met again they are said again. */
        fun toSay(alerts: List<AheadAlert>, said: Set<String>): Pair<String?, Set<String>> {
            val fresh = alerts.filter { it.id !in said }.sortedBy { it.seconds }
            val kept = said.filter { id -> alerts.any { it.id == id } }.toMutableSet()
            fresh.forEach { kept += it.id }
            val first = fresh.firstOrNull() ?: return null to kept
            val more = fresh.size - 1
            return "${line(first)}${if (more > 0) ", and $more more" else ""}." to kept
        }
    }
}
