package app.wingtipmaps.android.ai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * "In Plain Words" under a screen's figures (docs/android-ai.md): a tap
 * in the tint asks for the figures in words -- on the phone, by Gemini
 * Nano -- and the words come under it, said as made on the phone, and how many sentences were left out for a
 * figure the app did not give. The figures above stay as they are; the
 * words are beside them, never in place of them. Shown only where words
 * can be had; `sources` are read at the tap, and a change in `key`
 * clears words made from the old ones.
 */
@Composable
fun AiWordsRow(task: AiTask, key: String, sources: () -> List<AssistantSource>, modifier: Modifier = Modifier) {
    val model: AiWordsModel = hiltViewModel(key = "ai-words-${task.name}-$key")
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(key) { model.sourcesAre(key) }
    if (!state.offered) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        TextButton(onClick = { model.ask(task, sources()) }, enabled = !state.working) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                if (state.working) Loading(Modifier.size(WingtipSpace.Lg)) else Icon(WingtipIcons.ai, contentDescription = null)
                Text(stringResource(R.string.ai_plain_words))
            }
        }
        state.answer?.let { answer ->
            Text(
                answer.text, style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            Text(stringResource(R.string.ai_made_on_phone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (answer.dropped > 0) {
                Text(
                    pluralStringResource(R.plurals.ai_left_out, answer.dropped, answer.dropped),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        ProblemLine(state.problem)
    }
}
