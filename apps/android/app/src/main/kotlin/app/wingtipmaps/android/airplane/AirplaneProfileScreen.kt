package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle

/**
 * An airplane's profile by its N-number (the owner, 2026-11-09): its
 * registration and type, and every figure with where it comes from --
 * the type's book, a photographed handbook page, or the pilot -- each a
 * tap to edit in place, a figure of the pilot's over a book figure with
 * Reset to Book Figure under it, then its endurance (EnduranceSection).
 * Opened at `focus` from an ask's Edit.
 * The Figures section of the airplane's card (AirplaneCard), `top` (the
 * card's own head, edge to edge) and `head` (the flown airplane's own
 * rows) over the figures in the same scroll, `bottom` the room at its end
 * (the card's floating tab bar's).
 */
@Composable
fun AirplaneProfileScreen(
    airplane: AirplaneNow,
    focus: String?,
    model: AirplaneProfileModel = hiltViewModel(),
    bottom: Dp = WingtipSpace.Xl,
    top: @Composable ColumnScope.() -> Unit = {},
    head: @Composable ColumnScope.() -> Unit = {},
) {
    val context = LocalContext.current
    val own = remember(context) { OwnAirplanes.of(context) }
    val signedIn by own.signedIn.collectAsStateWithLifecycle()
    val state by model.state.collectAsStateWithLifecycle()
    // Each opening starts afresh, at the figure asked for where there is one.
    LaunchedEffect(airplane.tail, focus) {
        val at = FigureKey.of(focus.orEmpty())
        if (at != null) model.edit(at.key, airplane.value(at)) else model.cancel()
    }

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = bottom)) {
        top()
        Figures(airplane, state, model, own, signedIn, head)
    }
}

@Composable
private fun Figures(
    airplane: AirplaneNow,
    state: AirplaneProfileModel.State,
    model: AirplaneProfileModel,
    own: OwnAirplanes,
    signedIn: Boolean,
    head: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        head()
        if (airplane.name == null) {
            Text(stringResource(R.string.no_airplane_line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        Line(stringResource(R.string.registration), airplane.tail ?: "—")
        val type = airplane.record?.type?.ifEmpty { null } ?: airplane.aircraft.ifEmpty { null }
        Line(stringResource(R.string.profile_type), type?.uppercase() ?: stringResource(R.string.profile_no_type))
        if (!signedIn) Text(stringResource(R.string.profile_on_phone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SectionTitle(stringResource(R.string.profile_figures))
        FigureKey.entries.forEach { key ->
            if (state.editing == key.key) EditRow(key, state, model, onSave = { model.save(airplane, own) })
            else FigureRow(airplane, key, onEdit = { model.edit(key.key, airplane.value(key)) }, onReset = { model.reset(airplane, key, own) })
        }
        if (state.editing == null) ProblemLine(state.problem)
        EnduranceSection(airplane, onEdit = { key -> model.edit(key.key, airplane.value(key)) })
    }
}

@Composable
private fun Line(name: String, value: String) {
    ListItem(
        trailingContent = { Text(value, style = MaterialTheme.typography.bodyLarge) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(name) },
    )
}

/** One figure: its name, its source, its value; a tap edits it. */
@Composable
private fun FigureRow(airplane: AirplaneNow, key: FigureKey, onEdit: () -> Unit, onReset: () -> Unit) {
    val f = airplane.figure(key)
    val source = stringResource(AirplaneProfileModel.sourceLabel(f?.source?.takeIf { f.value != null }))
    val book = f?.book?.takeIf { f.source == "pilot" }?.let { " · " + stringResource(R.string.source_book) + " " + key.show(it) }.orEmpty()
    ListItem(
        onClick = onEdit,
        supportingContent = { Text(source + book, color = MaterialTheme.colorScheme.onSurfaceVariant) },
        trailingContent = { Text(f?.value?.let(key::show) ?: "—", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(stringResource(key.label)) },
    )
    if (AirplaneProfileModel.resettable(f?.source, f?.book)) {
        TextButton(onClick = onReset) { Text(stringResource(R.string.reset_to_book)) }
    }
}

/** The figure being edited: its field, focused, Cancel and Save. */
@Composable
private fun EditRow(key: FigureKey, state: AirplaneProfileModel.State, model: AirplaneProfileModel, onSave: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(key) { focus.requestFocus() }
    Column(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Xs)) {
        OutlinedTextField(
            value = state.text,
            onValueChange = model::type,
            label = { Text(stringResource(key.label)) },
            suffix = { Text(key.unit) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().focusRequester(focus),
        )
        ProblemLine(state.problem)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.weight(1f))
            TextButton(onClick = model::cancel) { Text(stringResource(R.string.cancel)) }
            Button(onClick = onSave, enabled = !state.saving) { Text(stringResource(R.string.save)) }
        }
    }
}
