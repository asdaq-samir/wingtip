package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.aircraft.YourAirplanesRow
import app.wingtipmaps.android.aircraft.YourAirplanesSheet
import app.wingtipmaps.android.airplane.AirplaneFigureStrip
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.AircraftProfileSummary
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.checklist.ChecklistScreen
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.documents.AddFromPhotoRow
import app.wingtipmaps.android.documents.HandbookPhotoSheet
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The Airplane tab's model: the planner's airplane types
 *  (/api/aircraft-profiles), asked once. */
class AirplaneModel : ViewModel() {
    private val _profiles = MutableStateFlow<List<AircraftProfileSummary>>(emptyList())
    val profiles: StateFlow<List<AircraftProfileSummary>> = _profiles.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                _profiles.value = Planner.aircraftProfiles()
                _problem.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = "The airplane types could not be fetched: ${e.message}"
            }
        }
    }
}

/**
 * The Airplane tab (decision 0020: "airplane", the FAA's word): one of
 * the planner's airplane types picked from a menu (a discrete setting is
 * a menu, not a slider), the handbook figures the planner flies it on,
 * and its checklists; the pilot's own airplanes in Your Airplanes. The
 * airplane by N-number, with the pilot's own figures over the book's, is
 * its profile (airplane/), a tap away.
 */
@Composable
fun AirplaneScreen(plan: Plan, model: AirplaneModel = viewModel()) {
    val profiles by model.profiles.collectAsStateWithLifecycle()
    val problem by model.problem.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    var checklist by remember { mutableStateOf<ChecklistKind?>(null) }
    var photo by remember { mutableStateOf(false) }
    var mine by remember { mutableStateOf(false) }
    val airplane = rememberAirplaneNow(plan)
    // The checklist asked for by its name (OpenScreen); with no airplane
    // picked there is none, and the tab says to pick one.
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, state.airplane) {
        if (state.airplane && ScreenRequests.take(setOf(Screen.CHECKLISTS)) != null) checklist = ChecklistKind.NORMAL
    }

    Column(Modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        AirplanePicker(profiles, selected = state.aircraft, onPick = plan::setAircraft)
        ProblemLine(problem)
        if (airplane.profile != null) AirplaneFigureStrip(airplane)
        RegistrationField()
        PassengersRow()
        AddFromPhotoRow(stringResource(R.string.photo_line_airplane)) { photo = true }
        YourAirplanesRow { mine = true }
        if (!state.airplane) {
            Text(stringResource(R.string.no_airplane_line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // The emergency assistant needs no airplane picked.
            EmergencyAssistantRow()
            return@Column
        }
        // The airplane's own checklists (#220), kept on this phone: the
        // normal procedures, and the emergency ones a tap away.
        SectionTitle(stringResource(R.string.checklists))
        ChecklistKind.entries.forEach { kind ->
            val normal = kind == ChecklistKind.NORMAL
            ListItem(
                headlineContent = { Text(stringResource(if (normal) R.string.checklist_normal else R.string.checklist_emergency)) },
                supportingContent = {
                    Text(stringResource(if (normal) R.string.checklist_normal_line else R.string.checklist_emergency_line), color = MaterialTheme.colorScheme.onSurfaceVariant)
                },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { checklist = kind },
            )
        }
        // Under the checklists, as the emergency checklist has it: 2 taps.
        EmergencyAssistantRow()
    }
    if (photo) HandbookPhotoSheet(type = state.aircraft, onClose = { photo = false })
    if (mine) YourAirplanesSheet(onClose = { mine = false })
    checklist?.let { kind ->
        // An own airplane of no stock type keeps its checklists by its N-number.
        val key = state.aircraft.ifEmpty { airplane.base().key }
        val title = stringResource(R.string.checklists_of, key.uppercase())
        WingtipSheet(title = title, onClose = { checklist = null }, full = true) {
            ChecklistScreen(airplane = key, kind = kind)
        }
    }
}

/**
 * One of the planner's airplane types, or No Airplane (the default: none
 * is assumed, decision 0011), from a menu: the Airplane tab's and the
 * welcome's one picker.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AirplanePicker(profiles: List<AircraftProfileSummary>, selected: String, onPick: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val picked = profiles.firstOrNull { it.name == selected }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = picked?.let(::label) ?: selected.uppercase().ifEmpty { stringResource(R.string.no_airplane) },
            onValueChange = {},
            readOnly = true,
            label = { Text(stringResource(R.string.tab_airplane)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.no_airplane)) },
                onClick = {
                    onPick("")
                    expanded = false
                },
            )
            profiles.forEach { profile ->
                DropdownMenuItem(
                    text = { Text(label(profile)) },
                    onClick = {
                        onPick(profile.name)
                        expanded = false
                    },
                )
            }
        }
    }
}

/** The airplane's registration (N-number), the call sign the ATC copilot
 *  listens for and the logbook's airplane; kept as typed, upper-cased. */
@Composable
private fun RegistrationField() {
    val context = LocalContext.current
    val choices = remember(context) { FlightChoices.of(context) }
    val tail by choices.tail.collectAsStateWithLifecycle()
    var typed by remember { mutableStateOf(tail.orEmpty()) }
    OutlinedTextField(
        value = typed,
        onValueChange = {
            typed = it.uppercase()
            choices.setTail(it)
        },
        label = { Text(stringResource(R.string.registration)) },
        placeholder = { Text(stringResource(R.string.registration_hint)) },
        // The N-number's profile, every figure of it the pilot's to set.
        trailingIcon = {
            if (typed.isNotBlank()) {
                IconButton(onClick = { ProfileOpen.open(typed) }) { Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.profile_open)) }
            }
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Whether anyone but the pilot is aboard: where the web reads it from
 *  the load's seats, the phone, which has no load yet, asks. The copilot
 *  reads it for 61.57(b)'s passengers at night. */
@Composable
private fun PassengersRow() {
    val context = LocalContext.current
    val choices = remember(context) { FlightChoices.of(context) }
    val aboard by choices.passengers.collectAsStateWithLifecycle()
    ListItem(
        headlineContent = { Text(stringResource(R.string.passengers_aboard)) },
        trailingContent = { Switch(checked = aboard, onCheckedChange = null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().toggleable(value = aboard, role = Role.Switch, onValueChange = choices::setPassengers),
    )
}

/** "Piper Archer · PA28": the type's name and the planner's key for it. */
private fun label(profile: AircraftProfileSummary): String =
    "${profile.type} · ${profile.name.uppercase()}"
