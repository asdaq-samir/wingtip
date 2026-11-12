package app.wingtipmaps.android.aircraft

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import app.wingtipmaps.android.ui.sheet.DiscardDialog

/** The flown airplane's card's row that opens Your Airplanes. */
@Composable
fun YourAirplanesRow(onOpen: () -> Unit) {
    ListItem(
        onClick = onOpen,
        supportingContent = { Text(stringResource(R.string.your_airplanes_line), color = MaterialTheme.colorScheme.onSurfaceVariant) },
        leadingContent = { Icon(Icons.Outlined.Flight, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(stringResource(R.string.your_airplanes)) },
    )
}

/**
 * Your Airplanes, a page on the airplane card's stack (CardPage): the
 * pilot's airplanes, each opened to change or delete it, and Add
 * Airplane; one airplane's form in the same page, its title saying which,
 * ← and Back closing it back to the list.
 */
@Composable
fun YourAirplanesPage(exit: CardExit, model: AircraftModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val editing = state.editing
    val title = when {
        editing == null -> stringResource(R.string.your_airplanes)
        editing.id == null -> stringResource(R.string.add_airplane)
        else -> stringResource(R.string.edit_airplane)
    }
    // The form is a level of its own: Back comes back to the list first,
    // asking before it throws away a change not saved.
    val started = remember(editing?.id, editing != null) { editing?.form }
    val changed = editing != null && editing.form != started
    var asking by remember { mutableStateOf(false) }
    val leaveForm = { if (changed) asking = true else model.close() }
    BackHandler(enabled = editing != null) { leaveForm() }
    val back = CardExit(back = { if (editing != null) leaveForm() else exit.back() }, close = { if (changed) asking = true else exit.close() })
    if (asking) {
        DiscardDialog(onDiscard = {
            asking = false
            model.close()
        }, onKeep = { asking = false })
    }
    CardPage(title = title, exit = back) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
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
        state.loading -> LoadingRow()
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
        onClick = onOpen,
        supportingContent = { Text("${a.typeDesignator} · ${AircraftForm.figuresLine(a)}", color = MaterialTheme.colorScheme.onSurfaceVariant) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(a.tailNumber) },
    )
}

@Composable
private fun AirplaneEditor(editing: AircraftModel.Editing, problem: String?, model: AircraftModel) {
    AircraftFormFields(editing.form, editing.problems, onChange = model::change)
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
