package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenu
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.aircraft.YourAirplanesRow
import app.wingtipmaps.android.api.AircraftProfileSummary
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.documents.AddFromPhotoRow
import app.wingtipmaps.android.documents.HandbookPhotoSheet
import app.wingtipmaps.android.plan.FlightChoices
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The airplane card's picker's model: the planner's airplane types
 *  (/api/aircraft-profiles), asked once, and again by Try Again. */
@HiltViewModel
class AirplaneModel @Inject constructor() : ViewModel() {
    private val _profiles = MutableStateFlow<List<AircraftProfileSummary>>(emptyList())
    val profiles: StateFlow<List<AircraftProfileSummary>> = _profiles.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    init {
        load()
    }

    /** The types asked for: at first, and again after a failure. */
    fun load() {
        viewModelScope.launch {
            try {
                _profiles.value = Planner.aircraftProfiles()
                _problem.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = Problems.say("The airplane types could not be fetched", e)
            }
        }
    }
}

/**
 * The airplane flown now, set where its card opens (the card rule, the
 * owner, 2026-11-10: one airplane card everywhere -- the plan's Airplane,
 * a link's `airplane`, Ready to Fly's Pick an Airplane, the emergency's
 * picker): one of the planner's airplane types picked from a menu (a
 * discrete setting is a menu, not a slider), its registration, whether
 * anyone is aboard, a handbook page added from a photo, and Your
 * Airplanes, which opens on the card's own stack; the emergency
 * assistant, which needs no airplane, under them. The figures follow in
 * the card (AirplaneProfileScreen), each a tap to edit in place.
 */
@Composable
internal fun FlownAirplaneRows(plan: Plan, onYourAirplanes: () -> Unit, model: AirplaneModel = hiltViewModel()) {
    val profiles by model.profiles.collectAsStateWithLifecycle()
    val problem by model.problem.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    var photo by remember { mutableStateOf(false) }
    AirplanePicker(profiles, selected = state.aircraft, onPick = plan::setAircraft)
    ProblemLine(problem, onRetry = model::load)
    RegistrationField()
    PassengersRow()
    AddFromPhotoRow(stringResource(R.string.photo_line_airplane)) { photo = true }
    YourAirplanesRow(onOpen = onYourAirplanes)
    EmergencyAssistantRow()
    if (photo) HandbookPhotoSheet(type = state.aircraft, onClose = { photo = false })
}

/**
 * One of the planner's airplane types, or No Airplane (the default: none
 * is assumed, decision 0011), from a menu: the Airplane page's and the
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
            label = { Text(stringResource(R.string.airplane)) },
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
 *  listens for and the logbook's airplane; kept as typed, upper-cased.
 *  Its figures are the card's own, under it. */
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
        checked = aboard,
        onCheckedChange = choices::setPassengers,
        trailingContent = { Switch(checked = aboard, onCheckedChange = null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(stringResource(R.string.passengers_aboard)) },
    )
}

/** "Piper Archer · PA28": the type's name and the planner's key for it. */
private fun label(profile: AircraftProfileSummary): String =
    "${profile.type} · ${profile.name.uppercase()}"
