package app.wingtipmaps.android.ai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * A draft written into a field the pilot then edits (a logbook entry's
 * remark): the same words as In Plain Words (AiWordsModel, on the phone
 * first, FigureGuard over them), put in the field by `onDraft` for the
 * pilot to keep, change or clear; nothing is saved until they Save.
 * Shown only where words can be had.
 */
@Composable
fun AiDraftButton(task: AiTask, key: String, label: String, sources: () -> List<AssistantSource>, onDraft: (String) -> Unit) {
    val model: AiWordsModel = hiltViewModel(key = "ai-draft-${task.name}-$key")
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.answer) { state.answer?.let { onDraft(it.text) } }
    if (!state.offered) return
    TextButton(onClick = { model.ask(task, sources()) }, enabled = !state.working) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            if (state.working) Loading(Modifier.size(WingtipSpace.Lg)) else Icon(WingtipIcons.ai, contentDescription = null)
            Text(label)
        }
    }
    ProblemLine(state.problem)
}
