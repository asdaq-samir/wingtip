package app.wingtipmaps.android.copilot

import android.content.Context
import android.speech.tts.TextToSpeech
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

/** The in-flight copilot as one choice (the web's lib/copilot/mode):
 *  off, its message shown, or shown and said aloud. On by default, as
 *  the web's preferences have it. */
enum class CopilotMode { OFF, ON, SPOKEN }

/** How the copilot speaks: Android's TextToSpeech, a fake in the tests. */
interface CopilotVoice {
    /** Said after anything already being said. */
    fun say(words: String)

    /** Said now, cutting off what is being said: a warning. */
    fun interrupt(words: String)
}

/**
 * The copilot's setting, kept across launches, and its voice, as the
 * spoken alerts keep theirs (SpokenAlerts): one per process.
 */
class CopilotSetting private constructor(context: Context) : CopilotVoice {
    private val prefs = Kept.of(context, "copilot")
    private val _mode = MutableStateFlow(runCatching { CopilotMode.valueOf(prefs[KEY] ?: "ON") }.getOrDefault(CopilotMode.ON))
    val mode: StateFlow<CopilotMode> = _mode.asStateFlow()
    private var ready = false
    private val voice = TextToSpeech(context.applicationContext) { status -> ready = status == TextToSpeech.SUCCESS }

    fun set(mode: CopilotMode) {
        prefs.edit { it[KEY] = mode.name }
        // Said once as it is turned on, so the pilot hears the voice it will use.
        if (mode == CopilotMode.SPOKEN && _mode.value != CopilotMode.SPOKEN) say("The copilot will speak.")
        _mode.value = mode
    }

    override fun say(words: String) = speak(words, TextToSpeech.QUEUE_ADD)

    override fun interrupt(words: String) = speak(words, TextToSpeech.QUEUE_FLUSH)

    private fun speak(words: String, queue: Int) {
        if (!ready) return
        voice.language = Locale.US
        voice.speak(words, queue, null, words.hashCode().toString())
    }

    companion object {
        private val KEY = stringPreferencesKey("mode")

        @Volatile
        private var shared: CopilotSetting? = null

        fun of(context: Context): CopilotSetting =
            shared ?: synchronized(this) { shared ?: CopilotSetting(context.applicationContext).also { shared = it } }
    }
}
