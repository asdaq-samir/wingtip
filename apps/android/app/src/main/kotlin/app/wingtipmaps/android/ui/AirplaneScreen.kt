package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AircraftProfileSummary
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.checklist.ChecklistScreen
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
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
 * and its checklists. The airplane by N-number, with the pilot's own
 * figures, is a later phase.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AirplaneScreen(plan: Plan, model: AirplaneModel = viewModel()) {
    val profiles by model.profiles.collectAsStateWithLifecycle()
    val problem by model.problem.collectAsStateWithLifecycle()
    val state by plan.state.collectAsStateWithLifecycle()
    var expanded by remember { mutableStateOf(false) }
    var checklist by remember { mutableStateOf<ChecklistKind?>(null) }
    val picked = profiles.firstOrNull { it.name == state.aircraft }

    Column(Modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
            OutlinedTextField(
                value = picked?.let(::label) ?: state.aircraft.uppercase().ifEmpty { stringResource(R.string.no_airplane) },
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(R.string.tab_airplane)) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                // None is a choice, and the default: no airplane is assumed.
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.no_airplane)) },
                    onClick = {
                        plan.setAircraft("")
                        expanded = false
                    },
                )
                profiles.forEach { profile ->
                    DropdownMenuItem(
                        text = { Text(label(profile)) },
                        onClick = {
                            plan.setAircraft(profile.name)
                            expanded = false
                        },
                    )
                }
            }
        }
        ProblemLine(problem)
        picked?.let { ProfileFigures(it) }
        if (!state.airplane) {
            Text(stringResource(R.string.no_airplane_line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    }
    checklist?.let { kind ->
        val title = stringResource(R.string.checklists_of, state.aircraft.uppercase())
        WingtipSheet(title = title, onClose = { checklist = null }, full = true) {
            ChecklistScreen(airplane = state.aircraft, kind = kind)
        }
    }
}

/** "Cessna 172 · C172": the type's name and the planner's key for it. */
private fun label(profile: AircraftProfileSummary): String =
    profile.type?.let { "$it · ${profile.name.uppercase()}" } ?: profile.name.uppercase()

/** The handbook figures the planner flies the type on, its own. */
@Composable
private fun ProfileFigures(profile: AircraftProfileSummary) {
    Row(Modifier.fillMaxWidth()) {
        Figure(stringResource(R.string.figure_cruise), Format.speed(profile.cruiseTasKt))
        Figure(stringResource(R.string.figure_burn), Format.burn(profile.fuelBurnGph))
        Figure(stringResource(R.string.figure_ceiling), Format.altitude(profile.serviceCeilingFt))
    }
}
