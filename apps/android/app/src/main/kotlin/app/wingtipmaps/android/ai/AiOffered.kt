package app.wingtipmaps.android.ai

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Whether a feature that needs a model -- Ask, a page read from a photo --
 * has one here: Gemini Nano on this phone, or the server's assistant while
 * the Claude features are on (ClaudeGate). With neither, the screens hide
 * the feature rather than offer what would fail: the owner's decision of
 * 2026-11-10 keeps Claude off for now ("For now just the free siri and
 * gemini"), and a phone without Nano then has no model to ask.
 */
object AiOffered {
    /** Asked where a screen is not drawing: a tap, a typed line. */
    suspend fun now(): Boolean = Nano.ready() || ClaudeGate.on.value

    /** As known now, without asking AICore: a phone not yet asked is
     *  taken as without Nano until it has been. */
    fun known(): Boolean = of(Nano.status.value, ClaudeGate.on.value)

    /** Whether the pilot may be offered it, as both change. */
    fun of(nano: Nano.Status, claude: Boolean): Boolean = nano == Nano.Status.AVAILABLE || claude
}

/** [AiOffered] for a screen, AICore asked once if it has not been. */
@Composable
fun rememberAiOffered(): Boolean {
    val nano by Nano.status.collectAsStateWithLifecycle()
    val claude by ClaudeGate.on.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { if (Nano.status.value == Nano.Status.UNKNOWN) Nano.check() }
    return AiOffered.of(nano, claude)
}
