package app.wingtipmaps.android.emergency

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the emergency assistant is open, and from where (the web's
 * emergencyStore): one place its three ways in open it from -- flying
 * mode's Emergency, the pilot's own words ("mayday", "engine failure",
 * "emergency") and the airplane's emergency checklists -- with no map
 * button of its own (decision 0010).
 */
object EmergencyOpen {
    enum class From { FLYING, VOICE, CHECKLIST }

    private val _from = MutableStateFlow<From?>(null)
    val from: StateFlow<From?> = _from.asStateFlow()

    fun open(from: From) {
        _from.value = from
    }

    fun close() {
        _from.value = null
    }

    /** Whether a line said or typed asks for the assistant: "mayday",
     *  "emergency", "engine failure" (the web's pilotCommand). */
    fun asked(words: String): Boolean {
        val toks = words.lowercase().split(Regex("""[^a-z]+""")).filter { it.isNotEmpty() }
        return toks.withIndex().any { (i, w) -> w == "mayday" || w == "emergency" || (w == "engine" && toks.getOrNull(i + 1)?.startsWith("fail") == true) }
    }
}
