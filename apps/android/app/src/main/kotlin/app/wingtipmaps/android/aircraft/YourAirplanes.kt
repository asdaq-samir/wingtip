package app.wingtipmaps.android.aircraft

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Flight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.design.Skeleton
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/** The Airplane tab's row that opens Your Airplanes. */
@Composable
fun YourAirplanesRow(onOpen: () -> Unit) {
    ListItem(
        supportingContent = { Text(stringResource(R.string.your_airplanes_line), color = MaterialTheme.colorScheme.onSurfaceVariant) },
        leadingContent = { Icon(Icons.Outlined.Flight, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen),
        content = { Text(stringResource(R.string.your_airplanes)) },
    )
}

/**
 * Your Airplanes: the pilot's airplanes, each opened to change or delete
 * it, and Add Airplane; one airplane's form in the same sheet, its title
 * saying which, closing back to the list.
 */
@Composable
fun YourAirplanesSheet(onClose: () -> Unit, model: AircraftModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val editing = state.editing
    val title = when {
        editing == null -> stringResource(R.string.your_airplanes)
        editing.id == null -> stringResource(R.string.add_airplane)
        else -> stringResource(R.string.edit_airplane)
    }
    WingtipSheet(title = title, onClose = { if (editing != null) model.close() else onClose() }, full = true) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            if (editing != null) AirplaneEditor(editing, state.problem, model) else AirplaneList(state, model)
        }
    }
}

@Composable
private fun AirplaneList(state: AircraftModel.State, model: AircraftModel) {
    ProblemLine(state.problem)
    when {
        state.loading -> Skeleton()
        state.signedOut -> Line(stringResource(R.string.your_airplanes_sign_in))
        else -> {
            if (state.airplanes.isEmpty() && state.problem == null) Line(stringResource(R.string.your_airplanes_none))
            state.airplanes.forEach { a -> AirplaneRow(a) { model.startEditing(a) } }
            Button(onClick = model::startAdding, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.add_airplane)) }
        }
    }
}

/** "N123AB" over "C182 · Cruise 135 kt, 12 gph at 65%". */
@Composable
private fun AirplaneRow(a: AircraftDto, onOpen: () -> Unit) {
    ListItem(
        supportingContent = { Text("${a.typeDesignator} · ${AircraftForm.figuresLine(a)}", color = MaterialTheme.colorScheme.onSurfaceVariant) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen),
        content = { Text(a.tailNumber) },
    )
}

@Composable
private fun AirplaneEditor(editing: AircraftModel.Editing, problem: String?, model: AircraftModel) {
    AircraftFormFields(editing.form, showProblems = editing.tried, onChange = model::change)
    ProblemLine(problem)
    Button(onClick = model::save, enabled = !editing.saving, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.save_airplane)) }
    if (editing.id != null) {
        TextButton(
            onClick = { model.confirmDelete(true) },
            enabled = !editing.saving,
            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.delete_airplane)) }
    }
    if (editing.confirmingDelete) {
        AlertDialog(
            onDismissRequest = { model.confirmDelete(false) },
            title = { Text(stringResource(R.string.delete_airplane_title, editing.form.tailNumber)) },
            text = { Text(stringResource(R.string.delete_airplane_text)) },
            confirmButton = {
                TextButton(
                    onClick = model::delete,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(stringResource(R.string.delete)) }
            },
            dismissButton = { TextButton(onClick = { model.confirmDelete(false) }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

@Composable
private fun Line(words: String) = Text(words, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
