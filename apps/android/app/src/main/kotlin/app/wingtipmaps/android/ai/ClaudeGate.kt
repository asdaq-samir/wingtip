package app.wingtipmaps.android.ai

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.gateway.Capabilities
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether this phone may ask Wingtip's assistant on the server (Claude)
 * anything at all: the one place every server-Claude call on Android asks
 * first (Assistant.stream, TripPlan.stream, Planner.coachWords,
 * Documents.read, AiWords).
 *
 * The owner, 2026-11-10: "To keep the cost low, we only add the claude
 * feature later when we decide about subscription model. For now just the
 * free siri and gemini." So the gateway says who has the Claude features
 * (GET /api/auth/capabilities, `claudeFeatures`: OFF, DEVELOPERS or
 * EVERYONE), OFF by default, and while they are off the phone's answers
 * stop at Gemini Nano on the phone (Nano, OnPhoneAsk, OnPhoneReader) and
 * the engine's own words. It fails closed: until the gateway has answered,
 * or where it cannot be read (offline, an older gateway), it is off, so a
 * question never falls through to a billed call nobody chose.
 */
object ClaudeGate {
    private val _on = MutableStateFlow(false)

    /** Whether the server's assistant may be asked now. */
    val on: StateFlow<Boolean> = _on.asStateFlow()

    /** Thrown by a server-Claude call asked while the features are off: a
     *  guard behind the screens, which hide what has no other way first. */
    class Off : IllegalStateException("That isn't available on this phone.")

    /** Whether Claude is this pilot's: EVERYONE's, or DEVELOPERS' and they
     *  are one. Anything else -- OFF, a word this build does not know, none
     *  at all -- is off. */
    fun on(features: String?, developer: Boolean): Boolean = when (features) {
        EVERYONE -> true
        DEVELOPERS -> developer
        else -> false
    }

    /** Throws [Off] unless the server's assistant may be asked. */
    fun require() {
        if (!_on.value) throw Off()
    }

    /** The gateway asked again: at launch and on every sign-in change
     *  (Session.load), as who the pilot is decides DEVELOPERS. */
    suspend fun refresh(developer: Boolean) {
        val features = try {
            Gateway.read<Capabilities>(PATH)?.claudeFeatures ?: OFF
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            OFF
        }
        set(features, developer)
    }

    /** Set by hand: the tests, and refresh. */
    fun set(features: String?, developer: Boolean) {
        _on.value = on(features, developer)
    }

    const val PATH = "/api/auth/capabilities"
    const val OFF = "OFF"
    const val DEVELOPERS = "DEVELOPERS"
    const val EVERYONE = "EVERYONE"
}
