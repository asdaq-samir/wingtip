package app.wingtipmaps.android.ai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.SectionTitle
import kotlinx.coroutines.launch

/**
 * Setup's On-Phone AI: whether Gemini Nano is on this phone, so the pilot
 * knows where the app's words are made, and Add Gemini Nano where Android
 * can fetch it (AICore's download, Google's). Nothing to turn on: the
 * phone is the only place the app's words are made (docs/android-ai.md).
 */
@Composable
fun OnPhoneAiRow() {
    val status by Nano.status.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { Nano.check() }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        SectionTitle(stringResource(R.string.ai_on_phone))
        val line = when (status) {
            Nano.Status.UNKNOWN -> R.string.ai_on_phone_checking
            Nano.Status.AVAILABLE -> R.string.ai_on_phone_ready
            Nano.Status.DOWNLOADABLE -> R.string.ai_on_phone_download
            Nano.Status.DOWNLOADING -> R.string.ai_on_phone_downloading
            Nano.Status.UNAVAILABLE -> R.string.ai_on_phone_none
        }
        Text(stringResource(line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (status == Nano.Status.DOWNLOADABLE) {
            OutlinedButton(onClick = { scope.launch { Nano.download() } }) { Text(stringResource(R.string.ai_get_nano)) }
        }
    }
}
