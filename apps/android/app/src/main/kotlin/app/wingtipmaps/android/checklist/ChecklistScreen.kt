package app.wingtipmaps.android.checklist

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.ui.ProblemLine

/**
 * An airplane's checklists (ChecklistModel): normal or emergency picked
 * at the top (two of them, a segmented control), then the list run
 * through -- each item a row ticked as done, each section's "n of m"
 * beside its title, Start over to clear them -- or written in the editor,
 * which can start from the phases' headings alone. The rows are Material's
 * checkable list items, so each touch target is the row's 56 dp, over
 * the 48 dp Material asks.
 */
@Composable
fun ChecklistScreen(airplane: String, kind: ChecklistKind, modifier: Modifier = Modifier) {
    val model: ChecklistModel = hiltViewModel()
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(airplane, kind) { model.show(airplane, kind) }

    Column(modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        ChoiceGroup(ChecklistKind.entries.map { it to it.title }, selected = state.kind) { k -> model.show(airplane, k) }
        ProblemLine(state.problem)
        // The emergency assistant from the emergency checklists: the best
        // fields within a glide, this list opened at the emergency, the
        // MAYDAY (decision 0010: its way in, with no map button).
        if (state.kind == ChecklistKind.EMERGENCY) {
            ListItem(
                onClick = { EmergencyOpen.open(EmergencyOpen.From.CHECKLIST) },
                supportingContent = { Text(stringResource(R.string.emergency_assistant_line)) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth(),
                content = { Text(stringResource(R.string.emergency_assistant), color = MaterialTheme.colorScheme.primary) },
            )
        }
        when (state.mode) {
            ChecklistModel.Mode.RUN -> RunView(state, model, Modifier.weight(1f))
            ChecklistModel.Mode.EDIT -> EditView(state, model, Modifier.weight(1f))
        }
    }
}

@Composable
private fun RunView(state: ChecklistModel.State, model: ChecklistModel, modifier: Modifier) {
    if (state.sections.isEmpty()) {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            Text(
                if (state.kind == ChecklistKind.EMERGENCY) {
                    "No emergency checklist for this airplane yet. Write it from the airplane's flight manual."
                } else {
                    "No checklist for this airplane yet. Write it from the airplane's flight manual."
                },
                style = MaterialTheme.typography.bodyLarge,
            )
            Button(onClick = model::edit) { Text("Write It") }
        }
        return
    }
    Column(modifier) {
        LazyColumn(Modifier.weight(1f)) {
            state.sections.forEachIndexed { s, section ->
                item(key = "s$s") {
                    Row(
                        Modifier.fillMaxWidth().padding(top = WingtipSpace.Lg, bottom = WingtipSpace.Xs).semantics(mergeDescendants = true) { heading() },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(section.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text(
                            "${ChecklistRun.done(state.sections, s, state.ticked)} of ${section.items.size}",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                itemsIndexed(section.items, key = { i, _ -> "s$s/$i" }) { i, item ->
                    val on = ChecklistRun.key(s, i) in state.ticked
                    ListItem(
                        checked = on,
                        onCheckedChange = { model.tick(s, i) },
                        leadingContent = { Checkbox(checked = on, onCheckedChange = null) },
                        trailingContent = item.response?.takeIf { it.isNotEmpty() }?.let { { Text(it, style = MaterialTheme.typography.bodyLarge) } },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        modifier = Modifier.fillMaxWidth(),
                        content = { Text(item.challenge) },
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            OutlinedButton(onClick = model::startOver, enabled = state.ticked.isNotEmpty()) { Text("Start Over") }
            TextButton(onClick = model::edit) { Text("Edit") }
        }
    }
}

@Composable
private fun EditView(state: ChecklistModel.State, model: ChecklistModel, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Text(
            "A line starting # is a section; every other line is an item, \"Fuel selector -- Both\". Copy it from the airplane's flight manual.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = state.draft, onValueChange = model::draft,
            label = { Text("${state.kind.title} checklist") },
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
        Row(Modifier.fillMaxWidth().padding(bottom = WingtipSpace.Sm), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            // The phases' headings only offered over an empty editor, so
            // nothing the pilot wrote is written over.
            if (state.draft.isBlank()) {
                OutlinedButton(onClick = model::startFromPhases) { Text("Start from the Phases") }
            }
            TextButton(onClick = model::cancelEdit) { Text("Cancel") }
            Button(onClick = model::save) { Text("Save") }
        }
    }
}
