package app.wingtipmaps.android.offline

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.LocalInk

/**
 * An answer shown from what the phone kept, said with its age: "Fetched
 * 42 min ago", in the caution's colour once it is older than ready to
 * fly's freshness for its kind (the engine's kept_age), in the muted grey
 * before. A warning only: the answer stays on the screen as it was (warn,
 * never limit). Nothing where the answer is the network's own
 * (`fetchedAtMs` null). Read again each minute, so the age keeps up.
 */
@Composable
fun KeptAgeLine(kind: String, fetchedAtMs: Long?, modifier: Modifier = Modifier) {
    if (fetchedAtMs == null) return
    val now by AppClock.ticking(MINUTE_MS)
    val age = remember(kind, fetchedAtMs, now / MINUTE_MS) { KeptForAir.age(kind, fetchedAtMs, now) } ?: return
    val finding = if (age.finding == "caution") Finding.CAUTION else Finding.UNKNOWN
    Text(
        age.line,
        modifier = modifier.testTag("kept-age-$kind"),
        style = MaterialTheme.typography.bodySmall,
        color = LocalInk.current.words(finding, MaterialTheme.colorScheme.onSurfaceVariant),
    )
}

private const val MINUTE_MS = 60_000L
