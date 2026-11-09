package app.wingtipmaps.android.emergency

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.checklist.ChecklistStore
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.ui.OwnShipControl

/**
 * Where the emergency assistant opens over the page, and only while it is
 * open (EmergencyOpen): its model follows own ship and asks the planner,
 * so shut it costs nothing. With own ship off it offers to show the
 * position, which the fields are worked out from.
 */
@Composable
fun EmergencyHost(plan: Plan, ownShip: OwnShipControl, model: EmergencyModel = viewModel()) {
    val from by EmergencyOpen.from.collectAsStateWithLifecycle()
    if (from == null) return
    val context = LocalContext.current
    val planned by plan.state.collectAsStateWithLifecycle()
    val fix by ownShip.ownShip.fix.collectAsStateWithLifecycle()
    val inFlight by InFlight.shared.state.collectAsStateWithLifecycle()
    val state by model.state.collectAsStateWithLifecycle()
    // No airplane chosen: no glide is guessed (decision 0011).
    val airplane = planned.aircraft.ifEmpty { null }
    LaunchedEffect(from, airplane) {
        val text = airplane?.let { ChecklistStore.of(context).text(it, ChecklistKind.EMERGENCY) }.orEmpty()
        model.start(airplane, airplane?.uppercase(), callsign = null, checklist = text)
    }
    // The airplane's track magnetic, the engine's, where it flies a route.
    LaunchedEffect(fix, ownShip.on) { model.took(if (ownShip.on) fix else null, inFlight.progress?.trackMagDeg) }
    EmergencySheet(state, model, onShowPosition = { if (!ownShip.on) ownShip.tap() }, onClose = EmergencyOpen::close)
}
