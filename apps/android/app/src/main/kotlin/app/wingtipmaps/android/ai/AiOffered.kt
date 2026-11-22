package app.wingtipmaps.android.ai

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Extra
import app.wingtipmaps.android.rememberExtra

/**
 * Whether a feature that needs a model -- Ask, a page read from a photo --
 * has one here: Gemini Nano on this phone, the only model the app asks
 * since the server's Claude features were taken out (decision 0041).
 * Without it the screens hide the feature rather than offer what would fail;
 * so too while Settings' Extras has Ask parked (Nano.parked).
 */
object AiOffered {
    /** Asked where a screen is not drawing: a tap, a typed line. */
    suspend fun now(): Boolean = Nano.ready()

    /** As known now, without asking AICore: a phone not yet asked is
     *  taken as without Nano until it has been. */
    fun known(): Boolean = !Nano.parked() && of(Nano.status.value)

    /** Whether the pilot may be offered it, as Nano's status changes. */
    fun of(nano: Nano.Status): Boolean = nano == Nano.Status.AVAILABLE
}

/** [AiOffered] for a screen, AICore asked once if it has not been, and
 *  only once Ask is on in Settings' Extras. */
@Composable
fun rememberAiOffered(): Boolean {
    val on = rememberExtra(Extra.ASK)
    val nano by Nano.status.collectAsStateWithLifecycle()
    LaunchedEffect(on) { if (on && Nano.status.value == Nano.Status.UNKNOWN) Nano.check() }
    return on && AiOffered.of(nano)
}
