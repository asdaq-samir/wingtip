package app.wingtipmaps.android.logbook

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiDraftButton
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine

/**
 * One logbook entry as Material's list item: the date and route as its
 * headline, the airplane, landings and remarks under it, and the time at
 * its end, so the hours line up down the list. A tap opens it into its
 * fields where it is (Material's inline edit; no form of its own), with
 * Save, Cancel and Delete. Delete takes it out with an Undo row in its
 * place (LogbookScreen); a refusal is said in the row.
 */
@Composable
fun LogbookEntryRow(e: LogbookEntryDto, state: LogbookModel.State, model: LogbookModel) {
    if (state.editing != e.id) {
        val editLabel = stringResource(R.string.logbook_edit_entry, e.flownOn)
        ListItem(
            onClick = { model.edit(e.id) },
            supportingContent = {
                Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                    // The airplane's N-number, its own tap to the airplane's
                    // profile inside the row's tap to edit.
                    e.aircraft?.let { tail ->
                        Text(tail, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable(role = Role.Button) { ProfileOpen.open(tail) })
                    }
                    LogbookModel.details(e)?.let { Text(it, maxLines = 2) }
                }
            },
            trailingContent = { Text(LogbookModel.hours(e), style = MaterialTheme.typography.bodyLarge) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            // TalkBack says what the row's tap does: "Edit the entry of …".
            modifier = Modifier.fillMaxWidth().semantics { onClick(label = editLabel) { model.edit(e.id); true } },
            content = { Text(listOfNotNull(e.flownOn, e.route?.ifEmpty { null }).joinToString(" · ")) },
        )
        return
    }
    // Kept while the row is open; a rotation starts it again from the entry.
    var form by remember(e.id) { mutableStateOf(LogbookForm.of(e)) }
    Column(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        LogbookFields(form) { form = it }
        // A remark drafted from the entry's own facts, into the field to edit.
        AiDraftButton(
            AiTask.LOGBOOK_REMARK, key = e.id.toString(), label = stringResource(R.string.ai_draft_remark),
            sources = { AiSources.logbook(form.date, form.route, form.airplane, form.total, form.night, form.dayLandings, form.nightLandings, e.approaches) },
            onDraft = { form = form.copy(remarks = it) },
        )
        ProblemLine(state.editProblem)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Button(onClick = { model.save(form) }, enabled = !state.saving) {
                Text(stringResource(if (state.saving) R.string.logbook_saving else R.string.save))
            }
            TextButton(onClick = model::cancelEdit) { Text(stringResource(R.string.cancel)) }
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { model.delete(e.id) }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    Text(stringResource(R.string.delete))
                }
            }
        }
    }
}
