package app.wingtipmaps.android.ready

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.BriefModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Ready to fly, shown by itself once a flight: when the pilot turns the
 * airplane on the map on (own ship, the start of flying mode on this
 * phone, whose instruments then come up at flying speed) while still on
 * the ground, and the engine finds something to fix. Not at flying speed
 * itself: a dialog on the takeoff roll is in the way, and the signal it
 * is about is going by then. The engine's line and at most three
 * actions over the map, each fixed in place, and Fly Anyway: it warns
 * and never stops the flight (the owner, 2026-10-23). Once per route.
 */
@Composable
fun ReadyToFlyHost(plan: Plan, ownShipOn: Boolean, underway: Boolean, onSetRoute: (() -> Unit)?, model: ReadyToFlyModel = hiltViewModel()) {
    val context = LocalContext.current
    val fixer = rememberReadyFixer(plan, onSetRoute, model)
    val brief: BriefModel = hiltViewModel()
    val state by model.state.collectAsStateWithLifecycle()
    // The route it was last shown for, kept across a rotation.
    var shownFor by rememberSaveable { mutableStateOf<String?>(null) }
    var open by rememberSaveable { mutableStateOf(false) }
    // Own ship as it was, so only the turn from off to on starts it (and
    // not the screen coming back with it already on).
    var wasOn by remember { mutableStateOf(ownShipOn) }
    LaunchedEffect(ownShipOn) {
        val started = ownShipOn && !wasOn
        wasOn = ownShipOn
        if (!started || underway) return@LaunchedEffect
        val planned = plan.state.value
        val key = ReadyFacts.flightKey(planned)
        if (key == shownFor) return@LaunchedEffect
        val local = withContext(Dispatchers.Default) { ReadyDevice.local(context, plan, brief.state.value.fetchedAtMs) }
        model.check(planned, ReadyFacts.cruise(planned.legs.map { it.altitudeFt }), local)
        if (model.state.value.caution) {
            shownFor = key
            open = true
        }
    }
    val answer = state.answer
    if (open && answer != null) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(answer.line) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                    // A tap fixes it and closes this, so the fix is seen.
                    answer.actions.forEach { ReadyActionRow(it, fixer, busy = it.fix in state.busy, before = { open = false }) }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text(stringResource(R.string.ready_fly_anyway)) } },
        )
    }
}
