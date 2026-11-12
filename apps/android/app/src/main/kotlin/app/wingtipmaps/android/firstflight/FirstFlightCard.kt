package app.wingtipmaps.android.firstflight

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.ui.OwnShipControl
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons

/** The card, for the UI tests. */
const val FIRST_FLIGHT_TAG = "first-flight"

/**
 * "Your First Flight" (the web's FirstFlight, the owner's canvas of
 * 2026-11-03): Material's elevated card riding the sheet's top, the first
 * time the app opens with no route on this phone and until it is planned
 * or put away (FirstFlightMemory): one line of what Wingtip does, a
 * destination field, Plan It, and the three steps under it -- Route, Nav
 * Log, Brief. The field is the one search (card rule 5: the airport picker
 * is the main search, never a field of its own), opened by a tap and its
 * pick handed back here. Where the phone has no position and no home
 * airport, a second field asks where from. Location is asked where it is
 * needed, by the system's own dialog at Plan It, never before; refused,
 * the card asks where from. Planned, the card is gone for good and the
 * nav log opens (`onPlanned`).
 */
@Composable
fun FirstFlightCard(plan: Plan, search: SearchControl, onPlanned: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val seen by remember(context) { FirstFlightMemory.of(context) }.seen.collectAsStateWithLifecycle()
    val planned by plan.state.collectAsStateWithLifecycle()
    if (seen || planned.routed) return
    val model: FirstFlightModel = hiltViewModel()
    val state by model.state.collectAsStateWithLifecycle()
    // Asked once, at the first Plan It with no departure given; answered
    // either way, the plan goes on (refused, it asks where from).
    var askedLocation by rememberSaveable { mutableStateOf(false) }
    val location = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { model.planIt(plan, onPlanned) }
    val planIt = {
        if (state.from == null && !askedLocation && !OwnShip.of(context).permitted) {
            askedLocation = true
            location.launch(OwnShipControl.LOCATION)
        } else {
            model.planIt(plan, onPlanned)
        }
    }
    ElevatedCard(modifier.testTag(FIRST_FLIGHT_TAG)) {
        Column(Modifier.padding(WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                Icon(WingtipIcons.airplane, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(stringResource(R.string.first_flight), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = model::dismiss) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.not_now)) }
            }
            Text(stringResource(R.string.first_flight_line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AirportPickField(state.dest, R.string.destination, R.string.first_flight_dest_hint) { search.pickAirport(R.string.where_to, model::pickDest) }
            if (state.needsFrom) {
                AirportPickField(state.from, R.string.first_flight_from, R.string.first_flight_from_hint) { search.pickAirport(R.string.where_from, model::pickFrom) }
            }
            ProblemLine(state.problem)
            Button(onClick = planIt, enabled = state.ready, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(if (state.planning) R.string.first_flight_planning else R.string.first_flight_plan))
            }
            Text(stringResource(R.string.first_flight_steps), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * An airport field that is the one search: Material's outlined text field,
 * read only, whose tap opens the search to pick the airport, as Android's
 * guide has a field open its picker (the date picker's field, a press
 * read on the field's way down and up) and TalkBack's double tap the same.
 */
@Composable
private fun AirportPickField(ident: String?, @StringRes label: Int, @StringRes hint: Int, onOpen: () -> Unit) {
    val words = stringResource(label)
    OutlinedTextField(
        value = ident.orEmpty(),
        onValueChange = {},
        readOnly = true,
        singleLine = true,
        label = { Text(words) },
        placeholder = { Text(stringResource(hint)) },
        trailingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        modifier = Modifier.fillMaxWidth()
            .semantics { onClick(label = words) { onOpen(); true } }
            .pointerInput(onOpen) {
                awaitEachGesture {
                    awaitFirstDown(pass = PointerEventPass.Initial)
                    if (waitForUpOrCancellation(pass = PointerEventPass.Initial) != null) onOpen()
                }
            },
    )
}
