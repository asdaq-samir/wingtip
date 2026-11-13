package app.wingtipmaps.android.ai

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Whether a feature that needs a model -- Ask, a page read from a photo --
 * has one here: Gemini Nano on this phone, the only model the app asks
 * since the server's Claude features were taken out (decision 0041).
 * Without it the screens hide the feature rather than offer what would fail.
 */
object AiOffered {
    /** Asked where a screen is not drawing: a tap, a typed line. */
    suspend fun now(): Boolean = Nano.ready()

    /** As known now, without asking AICore: a phone not yet asked is
     *  taken as without Nano until it has been. */
    fun known(): Boolean = of(Nano.status.value)

    /** Whether the pilot may be offered it, as Nano's status changes. */
    fun of(nano: Nano.Status): Boolean = nano == Nano.Status.AVAILABLE
}

/** [AiOffered] for a screen, AICore asked once if it has not been. */
@Composable
fun rememberAiOffered(): Boolean {
    val nano by Nano.status.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { if (Nano.status.value == Nano.Status.UNKNOWN) Nano.check() }
    return AiOffered.of(nano)
}
