package app.wingtipmaps.android.logbook

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine

/**
 * One logbook entry: its date over its route, hours and landings, a tap
 * opening it into its fields where it is (Material's inline edit; no form
 * of its own), with Save, Cancel and Delete. Delete takes it out with an
 * Undo row in its place (LogbookScreen); a refusal is said in the row.
 */
@Composable
fun LogbookEntryRow(e: LogbookEntryDto, state: LogbookModel.State, model: LogbookModel) {
    if (state.editing != e.id) {
        ListItem(
            overlineContent = { Text(e.flownOn) },
            headlineContent = { Text(LogbookModel.line(e)) },
            // The airplane's N-number, its own tap to the airplane's profile
            // inside the row's tap to edit.
            supportingContent = e.aircraft?.let { tail ->
                { Text(tail, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable(role = Role.Button) { ProfileOpen.open(tail) }) }
            },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = stringResource(R.string.logbook_edit_entry, e.flownOn)) { model.edit(e.id) },
        )
        return
    }
    // Kept while the row is open; a rotation starts it again from the entry.
    var form by remember(e.id) { mutableStateOf(LogbookForm.of(e)) }
    Column(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Field(R.string.flight_logged_date, form.date, Modifier.weight(1f)) { form = form.copy(date = it) }
            Field(R.string.tab_airplane, form.airplane, Modifier.weight(1f), letters = true) { form = form.copy(airplane = it) }
        }
        Field(R.string.flight_logged_route, form.route, Modifier.fillMaxWidth(), letters = true) { form = form.copy(route = it) }
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Field(R.string.flight_logged_total, form.total, Modifier.weight(1f), KeyboardType.Decimal) { form = form.copy(total = it) }
            Field(R.string.flight_logged_night, form.night, Modifier.weight(1f), KeyboardType.Decimal) { form = form.copy(night = it) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Field(R.string.flight_logged_day, form.dayLandings, Modifier.weight(1f), KeyboardType.Number) { form = form.copy(dayLandings = it) }
            Field(R.string.flight_logged_night_full_stop, form.nightLandings, Modifier.weight(1f), KeyboardType.Number) { form = form.copy(nightLandings = it) }
        }
        Field(R.string.logbook_remarks, form.remarks, Modifier.fillMaxWidth(), single = false) { form = form.copy(remarks = it) }
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

/** One of the row's fields, labelled as the Flight Logged sheet labels it. */
@Composable
private fun Field(
    @StringRes label: Int,
    value: String,
    modifier: Modifier,
    keyboard: KeyboardType = KeyboardType.Text,
    letters: Boolean = false,
    single: Boolean = true,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, modifier = modifier, singleLine = single,
        label = { Text(stringResource(label)) },
        keyboardOptions = KeyboardOptions(capitalization = if (letters) KeyboardCapitalization.Characters else KeyboardCapitalization.Sentences, keyboardType = keyboard),
    )
}
